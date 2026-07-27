const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function normalizeEnvValue(value) {
  const normalized = (value || "").trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    return normalized.slice(1, -1).trim();
  }

  return normalized;
}

function deploymentPath(fileName) {
  return path.join(process.cwd(), "deployments", fileName);
}

function readJsonIfExists(fileName) {
  const targetPath = deploymentPath(fileName);
  if (!fs.existsSync(targetPath)) return null;
  return JSON.parse(fs.readFileSync(targetPath, "utf8"));
}

function sameAddress(first, second) {
  return Boolean(first && second && first.toLowerCase() === second.toLowerCase());
}

function isAddress(value) {
  return hre.ethers.isAddress(value) && value !== hre.ethers.ZeroAddress;
}

function formatEth(value) {
  return hre.ethers.formatEther(value);
}

function formatToken(value, decimals) {
  return hre.ethers.formatUnits(value, Number(decimals));
}

function check(results, ok, message, details = "") {
  results.push({
    level: ok ? "PASS" : "FAIL",
    message,
    details,
  });
}

function warn(results, ok, message, details = "") {
  if (ok) {
    results.push({ level: "PASS", message, details });
  } else {
    results.push({ level: "WARN", message, details });
  }
}

function printSection(title) {
  console.log("");
  console.log(title);
  console.log("-".repeat(title.length));
}

function printResults(results) {
  for (const result of results) {
    const suffix = result.details ? `: ${result.details}` : "";
    console.log(`[${result.level}] ${result.message}${suffix}`);
  }
}

async function optionalCall(target, fnName, fallback = null) {
  if (!target || typeof target[fnName] !== "function") return fallback;
  return target[fnName]();
}

async function checkBank(networkName, expectedOwner, expectedSuiteTreasury, results) {
  const deployment = readJsonIfExists(`${networkName}.json`);
  if (!deployment) {
    warn(results, false, "Bank deployment file not found", `${networkName}.json`);
    return null;
  }

  check(results, isAddress(deployment.contractAddress), "Bank deployment has a contract address", deployment.contractAddress);
  if (!isAddress(deployment.contractAddress)) return null;

  const contractName = deployment.contractName || "SimpleBankV2";
  const bank = await hre.ethers.getContractAt(contractName, deployment.contractAddress);

  const [
    owner,
    paused,
    treasury,
    totalDeposits,
    contractBalance,
    interestReserve,
    protocolFees,
    depositFeeBps,
    withdrawalFeeBps,
  ] = await Promise.all([
    bank.owner(),
    bank.paused(),
    optionalCall(bank, "treasury"),
    optionalCall(bank, "totalDeposits", 0n),
    optionalCall(bank, "getContractBalance", await hre.ethers.provider.getBalance(deployment.contractAddress)),
    optionalCall(bank, "interestReserve", 0n),
    optionalCall(bank, "protocolFees", 0n),
    optionalCall(bank, "depositFeeBps", 0n),
    optionalCall(bank, "withdrawalFeeBps", 0n),
  ]);

  const expected = expectedOwner || deployment.owner || deployment.initialOwner;
  const expectedTreasury =
    normalizeEnvValue(process.env.EXPECTED_BANK_TREASURY || process.env.BANK_TREASURY) ||
    expectedSuiteTreasury ||
    deployment.treasury ||
    expected;
  check(results, sameAddress(owner, expected), "Bank owner matches expected Safe", owner);
  if (treasury) check(results, sameAddress(treasury, expectedTreasury), "Bank treasury matches expected", treasury);
  warn(results, !paused, "Bank is not paused", paused ? "paused" : "active");

  const protectedAssets = BigInt(totalDeposits) + BigInt(interestReserve) + BigInt(protocolFees);
  check(
    results,
    BigInt(contractBalance) >= protectedAssets,
    "Bank ETH balance covers deposits, reserve, and protocol fees",
    `balance ${formatEth(contractBalance)} ETH, protected ${formatEth(protectedAssets)} ETH`
  );

  warn(results, BigInt(depositFeeBps) <= 100n, "Bank deposit fee is within 1% cap", `${depositFeeBps.toString()} bps`);
  warn(results, BigInt(withdrawalFeeBps) <= 100n, "Bank withdrawal fee is within 1% cap", `${withdrawalFeeBps.toString()} bps`);

  console.log("");
  console.log("Bank:", deployment.contractAddress);
  console.log("  Contract:", contractName);
  console.log("  Owner:", owner);
  if (treasury) console.log("  Treasury:", treasury);
  console.log("  Total deposits:", `${formatEth(totalDeposits)} ETH`);
  console.log("  Interest reserve:", `${formatEth(interestReserve)} ETH`);
  console.log("  Protocol fees:", `${formatEth(protocolFees)} ETH`);

  return {
    address: deployment.contractAddress,
    contractName,
    owner,
    treasury,
  };
}

async function checkVault(networkName, expectedOwner, expectedSuiteTreasury, results) {
  const deployment =
    readJsonIfExists(`strategy-vault-${networkName}.json`) ||
    readJsonIfExists(`weth-vault-${networkName}.json`);

  if (!deployment) {
    warn(results, false, "Vault deployment file not found", `strategy-vault-${networkName}.json`);
    return null;
  }

  check(results, isAddress(deployment.contractAddress), "Vault deployment has a contract address", deployment.contractAddress);
  if (!isAddress(deployment.contractAddress)) return null;

  const contractName = deployment.contractName || "SimpleWETHYieldVault";
  const vault = await hre.ethers.getContractAt(contractName, deployment.contractAddress);

  let [
    asset,
    owner,
    treasury,
    paused,
    totalAssets,
    totalSupply,
    accountedAssets,
    performanceFeeBps,
    maxTotalAssets,
    strategy,
    idleAssets,
    strategyAssets,
    rawEth,
  ] = await Promise.all([
    vault.asset(),
    vault.owner(),
    vault.treasury(),
    vault.paused(),
    vault.totalAssets(),
    vault.totalSupply(),
    vault.accountedAssets(),
    vault.performanceFeeBps(),
    vault.maxTotalAssets(),
    optionalCall(vault, "strategy", hre.ethers.ZeroAddress),
    optionalCall(vault, "idleAssets", null),
    optionalCall(vault, "strategyAssets", 0n),
    hre.ethers.provider.getBalance(deployment.contractAddress),
  ]);

  if (idleAssets === null) {
    const assetContract = new hre.ethers.Contract(
      asset,
      ["function balanceOf(address account) view returns (uint256)"],
      hre.ethers.provider
    );
    idleAssets = await assetContract.balanceOf(deployment.contractAddress);
  }

  const expected = expectedOwner || deployment.owner;
  const expectedTreasury =
    normalizeEnvValue(process.env.EXPECTED_VAULT_TREASURY || process.env.VAULT_TREASURY) ||
    expectedSuiteTreasury ||
    deployment.treasury ||
    expected;
  check(results, sameAddress(owner, expected), "Vault owner matches expected Safe", owner);
  check(results, sameAddress(treasury, expectedTreasury), "Vault treasury matches expected", treasury);
  check(results, sameAddress(asset, deployment.weth), "Vault asset matches deployment WETH", asset);
  warn(results, !paused, "Vault is not paused", paused ? "paused" : "active");
  warn(results, BigInt(performanceFeeBps) <= 2000n, "Vault performance fee is within 20% cap", `${performanceFeeBps.toString()} bps`);
  check(
    results,
    BigInt(totalAssets) === BigInt(idleAssets) + BigInt(strategyAssets),
    "Vault totalAssets equals idle plus strategy assets",
    `${formatEth(totalAssets)} WETH = ${formatEth(idleAssets)} + ${formatEth(strategyAssets)}`
  );
  check(results, BigInt(accountedAssets) <= BigInt(totalAssets), "Vault accounted assets do not exceed total assets");
  check(results, BigInt(rawEth) === 0n, "Vault holds no raw ETH outside WETH flow", `${formatEth(rawEth)} ETH`);
  if (BigInt(maxTotalAssets) !== 0n) {
    check(results, BigInt(totalAssets) <= BigInt(maxTotalAssets), "Vault assets are below cap", `${formatEth(totalAssets)} / ${formatEth(maxTotalAssets)} WETH`);
  }

  console.log("");
  console.log("Vault:", deployment.contractAddress);
  console.log("  Contract:", contractName);
  console.log("  Asset:", asset);
  console.log("  Owner:", owner);
  console.log("  Treasury:", treasury);
  console.log("  Strategy:", strategy);
  console.log("  Total assets:", `${formatEth(totalAssets)} WETH`);
  console.log("  Total supply:", `${hre.ethers.formatUnits(totalSupply, await vault.decimals())} sbWETH`);
  console.log("  Idle assets:", `${formatEth(idleAssets)} WETH`);
  console.log("  Strategy assets:", `${formatEth(strategyAssets)} WETH`);

  return {
    address: deployment.contractAddress,
    contractName,
    asset,
    owner,
    treasury,
    strategy,
    totalAssets,
  };
}

async function checkManager(networkName, vaultInfo, expectedOwner, results) {
  const deployment = readJsonIfExists(`strategy-manager-${networkName}.json`);
  if (!deployment) {
    warn(results, false, "Strategy manager deployment file not found", `strategy-manager-${networkName}.json`);
    return null;
  }

  check(results, isAddress(deployment.contractAddress), "Manager deployment has a contract address", deployment.contractAddress);
  if (!isAddress(deployment.contractAddress)) return null;

  const manager = await hre.ethers.getContractAt("SimpleStrategyManager", deployment.contractAddress);
  const [
    asset,
    vault,
    owner,
    defaultStrategy,
    idleAssets,
    totalStrategyAssets,
    totalAssets,
    strategyAddresses,
  ] = await Promise.all([
    manager.asset(),
    manager.vault(),
    manager.owner(),
    manager.defaultStrategy(),
    manager.idleAssets(),
    manager.totalStrategyAssets(),
    manager.totalAssets(),
    manager.getStrategies(),
  ]);

  const expected = expectedOwner || deployment.owner;
  check(results, sameAddress(owner, expected), "Manager owner matches expected Safe", owner);
  check(results, sameAddress(vault, deployment.vaultAddress), "Manager vault matches deployment", vault);
  if (vaultInfo) {
    check(results, sameAddress(vault, vaultInfo.address), "Manager vault matches active vault", vault);
    check(results, sameAddress(asset, vaultInfo.asset), "Manager asset matches vault asset", asset);
    check(results, sameAddress(vaultInfo.strategy, deployment.contractAddress), "Vault strategy is set to manager", vaultInfo.strategy);
  }
  check(
    results,
    BigInt(totalAssets) === BigInt(idleAssets) + BigInt(totalStrategyAssets),
    "Manager totalAssets equals idle plus strategy assets",
    `${formatEth(totalAssets)} WETH = ${formatEth(idleAssets)} + ${formatEth(totalStrategyAssets)}`
  );

  warn(results, strategyAddresses.length > 0, "Manager has at least one strategy", `${strategyAddresses.length}`);
  warn(results, defaultStrategy !== hre.ethers.ZeroAddress, "Manager default strategy is set", defaultStrategy);

  console.log("");
  console.log("Manager:", deployment.contractAddress);
  console.log("  Owner:", owner);
  console.log("  Vault:", vault);
  console.log("  Asset:", asset);
  console.log("  Default strategy:", defaultStrategy);
  console.log("  Idle assets:", `${formatEth(idleAssets)} WETH`);
  console.log("  Strategy assets:", `${formatEth(totalStrategyAssets)} WETH`);

  for (const strategyAddress of strategyAddresses) {
    const [config, strategyAssets, capacity, strategyAsset] = await Promise.all([
      manager.strategyConfigs(strategyAddress),
      manager.strategyAssets(strategyAddress),
      manager.availableStrategyCapacity(strategyAddress),
      hre.ethers.getContractAt("AaveV3WETHStrategy", strategyAddress)
        .then((strategy) => strategy.asset())
        .catch(async () => {
          const genericStrategy = await hre.ethers.getContractAt("ISimpleYieldStrategy", strategyAddress);
          return genericStrategy.asset();
        }),
    ]);

    check(results, config.approved, "Manager strategy is approved", strategyAddress);
    check(results, sameAddress(strategyAsset, asset), "Manager strategy asset matches manager asset", strategyAddress);
    if (config.maxAssets !== 0n) {
      check(
        results,
        BigInt(strategyAssets) <= BigInt(config.maxAssets),
        "Manager strategy assets are below cap",
        `${strategyAddress} ${formatEth(strategyAssets)} / ${formatEth(config.maxAssets)} WETH`
      );
    }
    if (sameAddress(strategyAddress, deployment.strategyAddress)) {
      check(results, sameAddress(defaultStrategy, strategyAddress), "Deployment strategy is the default strategy", strategyAddress);
    }

    const capacityText = capacity === hre.ethers.MaxUint256 ? "uncapped" : `${formatEth(capacity)} WETH`;
    console.log("");
    console.log("  Strategy:", strategyAddress);
    console.log("    Approved:", config.approved ? "yes" : "no");
    console.log("    Cap:", config.maxAssets === 0n ? "uncapped" : `${formatEth(config.maxAssets)} WETH`);
    console.log("    Assets:", `${formatEth(strategyAssets)} WETH`);
    console.log("    Remaining capacity:", capacityText);
  }

  return {
    address: deployment.contractAddress,
    asset,
    vault,
    owner,
    defaultStrategy,
    totalAssets,
  };
}

async function checkAaveStrategy(networkName, managerInfo, results) {
  const managerDeployment = readJsonIfExists(`strategy-manager-${networkName}.json`);
  if (!managerDeployment || !isAddress(managerDeployment.strategyAddress)) {
    warn(results, false, "Manager-owned Aave strategy deployment not found");
    return;
  }

  const strategy = await hre.ethers.getContractAt("AaveV3WETHStrategy", managerDeployment.strategyAddress);
  const [asset, aToken, pool, vault, owner, totalAssets] = await Promise.all([
    strategy.asset(),
    strategy.aToken(),
    strategy.pool(),
    strategy.vault(),
    strategy.owner(),
    strategy.totalAssets(),
  ]);

  check(results, sameAddress(asset, managerDeployment.weth), "Aave strategy asset matches deployment WETH", asset);
  check(results, sameAddress(aToken, managerDeployment.aaveAToken), "Aave strategy aToken matches deployment", aToken);
  check(results, sameAddress(pool, managerDeployment.aavePool), "Aave strategy pool matches deployment", pool);
  check(results, sameAddress(vault, managerDeployment.contractAddress), "Aave strategy authorized caller is manager", vault);
  if (managerInfo) {
    check(results, sameAddress(vault, managerInfo.address), "Aave strategy authorized caller matches live manager", vault);
  }
  check(results, sameAddress(owner, managerDeployment.strategyOwner || managerDeployment.owner), "Aave strategy owner matches expected", owner);

  console.log("");
  console.log("Aave strategy:", managerDeployment.strategyAddress);
  console.log("  Asset:", asset);
  console.log("  aToken:", aToken);
  console.log("  Pool:", pool);
  console.log("  Authorized caller:", vault);
  console.log("  Total assets:", `${formatEth(totalAssets)} WETH`);
}

async function checkLending(networkName, expectedOwner, expectedSuiteTreasury, results) {
  const deployment = readJsonIfExists(`lending-pool-${networkName}.json`);
  if (!deployment) {
    warn(results, false, "Lending pool deployment file not found", `lending-pool-${networkName}.json`);
    return null;
  }

  check(results, isAddress(deployment.contractAddress), "Lending deployment has a contract address", deployment.contractAddress);
  if (!isAddress(deployment.contractAddress)) return null;

  const pool = await hre.ethers.getContractAt("SimpleLendingPool", deployment.contractAddress);
  const [
    owner,
    treasury,
    paused,
    borrowAprBps,
    originationFeeBps,
    maxLtvBps,
    liquidationThresholdBps,
    liquidationBonusBps,
    maxPoolLiquidity,
    totalAssets,
    availableLiquidity,
    totalSupplyShares,
    totalBorrowDebt,
    totalCollateral,
    protocolFees,
    contractBalance,
  ] = await Promise.all([
    pool.owner(),
    pool.treasury(),
    pool.paused(),
    pool.borrowAprBps(),
    pool.originationFeeBps(),
    pool.maxLtvBps(),
    pool.liquidationThresholdBps(),
    pool.liquidationBonusBps(),
    pool.maxPoolLiquidity(),
    pool.totalAssets(),
    pool.availableLiquidity(),
    pool.totalSupplyShares(),
    pool.totalBorrowDebt(),
    pool.totalCollateral(),
    pool.protocolFees(),
    hre.ethers.provider.getBalance(deployment.contractAddress),
  ]);

  const expected = expectedOwner || deployment.owner;
  const expectedTreasury =
    normalizeEnvValue(process.env.EXPECTED_LENDING_TREASURY || process.env.LENDING_TREASURY) ||
    expectedSuiteTreasury ||
    deployment.treasury ||
    expected;
  check(results, sameAddress(owner, expected), "Lending owner matches expected Safe", owner);
  check(results, sameAddress(treasury, expectedTreasury), "Lending treasury matches expected", treasury);
  warn(results, !paused, "Lending pool is not paused", paused ? "paused" : "active");
  warn(results, BigInt(borrowAprBps) <= 5000n, "Lending borrow APR is within 50% cap", `${borrowAprBps.toString()} bps`);
  warn(results, BigInt(originationFeeBps) <= 100n, "Lending origination fee is within 1% cap", `${originationFeeBps.toString()} bps`);
  check(
    results,
    BigInt(maxLtvBps) <= BigInt(liquidationThresholdBps),
    "Lending max LTV does not exceed liquidation threshold",
    `${maxLtvBps.toString()} / ${liquidationThresholdBps.toString()} bps`
  );
  warn(results, BigInt(liquidationBonusBps) <= 2000n, "Lending liquidation bonus is within 20% cap", `${liquidationBonusBps.toString()} bps`);
  check(
    results,
    BigInt(contractBalance) >= BigInt(totalCollateral) + BigInt(protocolFees),
    "Lending ETH balance covers collateral and protocol fees",
    `balance ${formatEth(contractBalance)} ETH, protected ${formatEth(BigInt(totalCollateral) + BigInt(protocolFees))} ETH`
  );
  if (BigInt(maxPoolLiquidity) !== 0n) {
    check(
      results,
      BigInt(totalAssets) <= BigInt(maxPoolLiquidity),
      "Lending assets are below liquidity cap",
      `${formatEth(totalAssets)} / ${formatEth(maxPoolLiquidity)} ETH`
    );
  }

  console.log("");
  console.log("Lending pool:", deployment.contractAddress);
  console.log("  Owner:", owner);
  console.log("  Treasury:", treasury);
  console.log("  Total assets:", `${formatEth(totalAssets)} ETH`);
  console.log("  Available liquidity:", `${formatEth(availableLiquidity)} ETH`);
  console.log("  Total supply shares:", `${formatEth(totalSupplyShares)} lpETH`);
  console.log("  Total borrow debt:", `${formatEth(totalBorrowDebt)} ETH`);
  console.log("  Total collateral:", `${formatEth(totalCollateral)} ETH`);
  console.log("  Protocol fees:", `${formatEth(protocolFees)} ETH`);

  return {
    address: deployment.contractAddress,
    owner,
    treasury,
    totalAssets,
    protocolFees,
  };
}

async function checkSwap(networkName, expectedOwner, expectedSuiteTreasury, results) {
  const deployment = readJsonIfExists(`swap-pool-${networkName}.json`);
  if (!deployment) {
    warn(results, false, "Swap pool deployment file not found", `swap-pool-${networkName}.json`);
    return null;
  }

  check(results, isAddress(deployment.contractAddress), "Swap deployment has a contract address", deployment.contractAddress);
  if (!isAddress(deployment.contractAddress)) return null;

  const swap = await hre.ethers.getContractAt("SimpleSwapPool", deployment.contractAddress);
  const [
    owner,
    treasury,
    paused,
    token0,
    token1,
    token0Symbol,
    token1Symbol,
    token0Decimals,
    token1Decimals,
    reserve0,
    reserve1,
    protocolFees0,
    protocolFees1,
    swapFeeBps,
    protocolFeeShareBps,
    totalSupply,
  ] = await Promise.all([
    swap.owner(),
    swap.treasury(),
    swap.paused(),
    swap.token0(),
    swap.token1(),
    swap.token0Symbol(),
    swap.token1Symbol(),
    swap.token0Decimals(),
    swap.token1Decimals(),
    swap.reserve0(),
    swap.reserve1(),
    swap.protocolFees0(),
    swap.protocolFees1(),
    swap.swapFeeBps(),
    swap.protocolFeeShareBps(),
    swap.totalSupply(),
  ]);

  const token0Contract = new hre.ethers.Contract(
    token0,
    ["function balanceOf(address account) view returns (uint256)"],
    hre.ethers.provider
  );
  const token1Contract = new hre.ethers.Contract(
    token1,
    ["function balanceOf(address account) view returns (uint256)"],
    hre.ethers.provider
  );
  const [token0Balance, token1Balance] = await Promise.all([
    token0Contract.balanceOf(deployment.contractAddress),
    token1Contract.balanceOf(deployment.contractAddress),
  ]);

  const expected = expectedOwner || deployment.owner;
  const expectedTreasury =
    normalizeEnvValue(process.env.EXPECTED_SWAP_TREASURY || process.env.SWAP_TREASURY) ||
    expectedSuiteTreasury ||
    deployment.treasury ||
    expected;
  check(results, sameAddress(owner, expected), "Swap owner matches expected Safe", owner);
  check(results, sameAddress(treasury, expectedTreasury), "Swap treasury matches expected", treasury);
  check(results, sameAddress(token0, deployment.token0), "Swap token0 matches deployment", token0);
  check(results, sameAddress(token1, deployment.token1), "Swap token1 matches deployment", token1);
  check(results, !sameAddress(token0, token1), "Swap tokens are distinct", `${token0} / ${token1}`);
  warn(results, !paused, "Swap pool is not paused", paused ? "paused" : "active");
  warn(results, BigInt(swapFeeBps) <= 100n, "Swap fee is within 1% cap", `${swapFeeBps.toString()} bps`);
  warn(
    results,
    BigInt(protocolFeeShareBps) <= 5000n,
    "Swap protocol fee share is within 50% cap",
    `${protocolFeeShareBps.toString()} bps`
  );
  check(
    results,
    BigInt(token0Balance) === BigInt(reserve0) + BigInt(protocolFees0),
    "Swap token0 balance equals reserves plus protocol fees",
    `${formatToken(token0Balance, token0Decimals)} = ${formatToken(reserve0, token0Decimals)} + ${formatToken(protocolFees0, token0Decimals)} ${token0Symbol}`
  );
  check(
    results,
    BigInt(token1Balance) === BigInt(reserve1) + BigInt(protocolFees1),
    "Swap token1 balance equals reserves plus protocol fees",
    `${formatToken(token1Balance, token1Decimals)} = ${formatToken(reserve1, token1Decimals)} + ${formatToken(protocolFees1, token1Decimals)} ${token1Symbol}`
  );

  console.log("");
  console.log("Swap pool:", deployment.contractAddress);
  console.log("  Owner:", owner);
  console.log("  Treasury:", treasury);
  console.log("  Token0:", `${token0Symbol} (${token0})`);
  console.log("  Token1:", `${token1Symbol} (${token1})`);
  console.log("  Reserve0:", `${formatToken(reserve0, token0Decimals)} ${token0Symbol}`);
  console.log("  Reserve1:", `${formatToken(reserve1, token1Decimals)} ${token1Symbol}`);
  console.log("  Protocol fees0:", `${formatToken(protocolFees0, token0Decimals)} ${token0Symbol}`);
  console.log("  Protocol fees1:", `${formatToken(protocolFees1, token1Decimals)} ${token1Symbol}`);
  console.log("  Total LP supply:", `${formatEth(totalSupply)} sbSWAP-LP`);

  return {
    address: deployment.contractAddress,
    owner,
    treasury,
    token0,
    token1,
  };
}

async function checkTreasury(networkName, expectedOwner, results) {
  const deployment = readJsonIfExists(`treasury-${networkName}.json`);
  if (!deployment) {
    warn(results, false, "Treasury deployment file not found", `treasury-${networkName}.json`);
    return null;
  }

  check(results, deployment.contractName === "SimpleTreasury", "Treasury deployment contract name matches", deployment.contractName || "(empty)");
  check(results, isAddress(deployment.contractAddress), "Treasury deployment has a contract address", deployment.contractAddress);
  if (!isAddress(deployment.contractAddress)) return null;

  const treasury = await hre.ethers.getContractAt("SimpleTreasury", deployment.contractAddress);
  const [owner, paused, assets, ethBalance] = await Promise.all([
    treasury.owner(),
    treasury.paused(),
    treasury.getTrackedAssets(),
    hre.ethers.provider.getBalance(deployment.contractAddress),
  ]);

  const expected = expectedOwner || deployment.owner;
  check(results, sameAddress(owner, expected), "Treasury owner matches expected Safe", owner);
  warn(results, !paused, "Treasury is not paused", paused ? "paused" : "active");
  check(
    results,
    assets.some((asset) => sameAddress(asset, hre.ethers.ZeroAddress)),
    "Treasury tracks ETH asset",
    `${assets.length} tracked asset(s)`
  );

  console.log("");
  console.log("Treasury:", deployment.contractAddress);
  console.log("  Owner:", owner);
  console.log("  Paused:", paused ? "yes" : "no");
  console.log("  ETH balance:", `${formatEth(ethBalance)} ETH`);
  console.log("  Tracked assets:", assets.length.toString());

  for (const asset of assets) {
    const policy = await treasury.assetPolicies(asset);
    if (sameAddress(asset, hre.ethers.ZeroAddress)) {
      console.log("  Asset ETH:");
      console.log("    Operator enabled:", policy.enabled ? "yes" : "no");
      console.log("    Spend limit:", `${formatEth(policy.spendLimit)} ETH`);
      console.log("    Spent:", `${formatEth(policy.spent)} ETH`);
      continue;
    }

    const token = new hre.ethers.Contract(
      asset,
      [
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
        "function balanceOf(address account) view returns (uint256)",
      ],
      hre.ethers.provider
    );

    const [symbol, decimals, balance] = await Promise.all([
      token.symbol().catch(() => "ERC20"),
      token.decimals().catch(() => 18n),
      token.balanceOf(deployment.contractAddress).catch(() => 0n),
    ]);

    console.log(`  Asset ${symbol} (${asset}):`);
    console.log("    Balance:", `${formatToken(balance, decimals)} ${symbol}`);
    console.log("    Operator enabled:", policy.enabled ? "yes" : "no");
    console.log("    Spend limit:", `${formatToken(policy.spendLimit, decimals)} ${symbol}`);
    console.log("    Spent:", `${formatToken(policy.spent, decimals)} ${symbol}`);
  }

  return {
    address: deployment.contractAddress,
    owner,
    paused,
    assets,
  };
}

async function main() {
  const networkName = hre.network.name;
  if (networkName === "mainnet" && !normalizeEnvValue(process.env.MAINNET_RPC_URL)) {
    throw new Error(
      "MAINNET_RPC_URL is empty. Use `npm.cmd run suite:health:sepolia` for your current deployment, or set MAINNET_RPC_URL before running mainnet health checks."
    );
  }

  const expectedOwner = normalizeEnvValue(process.env.EXPECTED_OWNER || "");
  const results = [];
  const network = await hre.ethers.provider.getNetwork();
  const treasuryDeployment = readJsonIfExists(`treasury-${networkName}.json`);
  const expectedSuiteTreasury = treasuryDeployment && isAddress(treasuryDeployment.contractAddress)
    ? treasuryDeployment.contractAddress
    : "";

  console.log("\nSimpleBank Suite Health Check");
  console.log("Network:", networkName);
  console.log("Chain ID:", network.chainId.toString());
  if (expectedOwner) console.log("Expected owner:", expectedOwner);
  if (expectedSuiteTreasury) console.log("Expected suite treasury:", expectedSuiteTreasury);

  printSection("Live State");
  const bankInfo = await checkBank(networkName, expectedOwner, expectedSuiteTreasury, results);
  const vaultInfo = await checkVault(networkName, expectedOwner, expectedSuiteTreasury, results);
  const managerInfo = await checkManager(networkName, vaultInfo, expectedOwner, results);
  await checkAaveStrategy(networkName, managerInfo, results);
  const lendingInfo = await checkLending(networkName, expectedOwner, expectedSuiteTreasury, results);
  const swapInfo = await checkSwap(networkName, expectedOwner, expectedSuiteTreasury, results);
  const treasuryInfo = await checkTreasury(networkName, expectedOwner, results);

  printSection("Checks");
  printResults(results);

  const failures = results.filter((result) => result.level === "FAIL");
  const warnings = results.filter((result) => result.level === "WARN");

  console.log("");
  console.log(`Health summary: ${failures.length} failure(s), ${warnings.length} warning(s), ${results.length} checks.`);
  if (bankInfo) console.log("Bank checked:", bankInfo.address);
  if (vaultInfo) console.log("Vault checked:", vaultInfo.address);
  if (managerInfo) console.log("Manager checked:", managerInfo.address);
  if (lendingInfo) console.log("Lending checked:", lendingInfo.address);
  if (swapInfo) console.log("Swap checked:", swapInfo.address);
  if (treasuryInfo) console.log("Treasury checked:", treasuryInfo.address);

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Suite health check failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
