const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ACTIONS = new Set([
  "status",
  "approve",
  "wrap-token0",
  "add-liquidity",
  "remove-liquidity",
  "swap",
  "claim-fees",
]);

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];
const WETH_ABI = [
  "function deposit() payable",
];

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

function parseAction() {
  const action = normalizeEnvValue(process.env.ACTION || "status");
  if (!ACTIONS.has(action)) {
    throw new Error(`ACTION must be one of ${Array.from(ACTIONS).join(", ")}, got: ${action}`);
  }

  return action;
}

function isTruthyEnv(name, fallback = false) {
  const raw = normalizeEnvValue(process.env[name]);
  if (!raw) return fallback;
  const value = raw.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function parseAddressEnv(name, fallback = "") {
  const address = normalizeEnvValue(process.env[name] || fallback);
  if (!hre.ethers.isAddress(address) || address === hre.ethers.ZeroAddress) {
    throw new Error(`${name} must be a non-zero address, got: ${address || "(empty)"}`);
  }

  return address;
}

function resolveViewAddress(defaultAddress = hre.ethers.ZeroAddress) {
  const viewAddress = normalizeEnvValue(process.env.VIEW_ADDRESS || defaultAddress);
  if (!hre.ethers.isAddress(viewAddress)) {
    throw new Error(`Invalid VIEW_ADDRESS: ${viewAddress}`);
  }

  return viewAddress;
}

function getSwapDeploymentPath(networkName) {
  const customPath = normalizeEnvValue(process.env.SWAP_DEPLOYMENT_FILE);
  if (customPath) {
    return path.isAbsolute(customPath) ? customPath : path.join(process.cwd(), customPath);
  }

  return path.join(process.cwd(), "deployments", `swap-pool-${networkName}.json`);
}

function readSwapDeployment(networkName) {
  const deploymentPath = getSwapDeploymentPath(networkName);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`${deploymentPath} does not exist. Deploy the swap pool or set SWAP_POOL_ADDRESS.`);
  }

  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

function resolvePoolAddress(networkName, deployment) {
  const configuredAddress = normalizeEnvValue(process.env.SWAP_POOL_ADDRESS);
  if (configuredAddress) {
    if (!hre.ethers.isAddress(configuredAddress)) {
      throw new Error(`Invalid SWAP_POOL_ADDRESS: ${configuredAddress}`);
    }

    return configuredAddress;
  }

  if (!hre.ethers.isAddress(deployment.contractAddress)) {
    throw new Error(`Invalid contractAddress in ${getSwapDeploymentPath(networkName)}`);
  }

  return deployment.contractAddress;
}

async function getToken(pool, side, signerOrProvider) {
  const address = side === 0 ? await pool.token0() : await pool.token1();
  return new hre.ethers.Contract(address, ERC20_ABI, signerOrProvider);
}

async function readTokenMeta(token) {
  const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()]);
  return { symbol, decimals: Number(decimals) };
}

function parseTokenAmount(rawAmount, decimals, name) {
  const normalized = normalizeEnvValue(rawAmount);
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`${name} must be a non-negative token amount, got: ${rawAmount}`);
  }

  return hre.ethers.parseUnits(normalized, decimals);
}

function parseTokenAmountEnv(name, decimals, fallback = "") {
  return parseTokenAmount(process.env[name] || fallback, decimals, name);
}

function formatToken(amount, decimals, symbol) {
  return `${hre.ethers.formatUnits(amount, decimals)} ${symbol}`;
}

async function resolveTokenSide(pool) {
  const value = normalizeEnvValue(process.env.TOKEN_IN || process.env.SWAP_TOKEN_IN || "token0").toLowerCase();
  if (value === "0" || value === "token0") return 0;
  if (value === "1" || value === "token1") return 1;

  const token0 = (await pool.token0()).toLowerCase();
  const token1 = (await pool.token1()).toLowerCase();
  if (value === token0) return 0;
  if (value === token1) return 1;

  throw new Error(`TOKEN_IN must be token0, token1, or a pool token address, got: ${value}`);
}

async function ensureAllowance(token, owner, spender, amount, label) {
  const allowance = await token.allowance(owner.address, spender);
  if (allowance >= amount) return;

  console.log(`Approving ${label}...`);
  const tx = await token.connect(owner).approve(spender, amount);
  await tx.wait();
  console.log(`${label} approval tx:`, tx.hash);
}

async function printStatus(pool, poolAddress, viewAddress, runner) {
  const token0 = await getToken(pool, 0, runner);
  const token1 = await getToken(pool, 1, runner);
  const [meta0, meta1] = await Promise.all([readTokenMeta(token0), readTokenMeta(token1)]);
  const [
    owner,
    treasury,
    paused,
    swapFeeBps,
    protocolFeeShareBps,
    reserve0,
    reserve1,
    protocolFees0,
    protocolFees1,
    totalSupply,
    viewLpShares,
    viewToken0Balance,
    viewToken1Balance,
    allowance0,
    allowance1,
  ] = await Promise.all([
    pool.owner(),
    pool.treasury(),
    pool.paused(),
    pool.swapFeeBps(),
    pool.protocolFeeShareBps(),
    pool.reserve0(),
    pool.reserve1(),
    pool.protocolFees0(),
    pool.protocolFees1(),
    pool.totalSupply(),
    viewAddress === hre.ethers.ZeroAddress ? 0n : pool.balanceOf(viewAddress),
    viewAddress === hre.ethers.ZeroAddress ? 0n : token0.balanceOf(viewAddress),
    viewAddress === hre.ethers.ZeroAddress ? 0n : token1.balanceOf(viewAddress),
    viewAddress === hre.ethers.ZeroAddress ? 0n : token0.allowance(viewAddress, poolAddress),
    viewAddress === hre.ethers.ZeroAddress ? 0n : token1.allowance(viewAddress, poolAddress),
  ]);

  console.log("\nSimpleSwapPool status");
  console.log("Network:", hre.network.name);
  console.log("Pool:", poolAddress);
  console.log("View address:", viewAddress);
  console.log("Owner:", owner);
  console.log("Treasury:", treasury);
  console.log("Paused:", paused ? "yes" : "no");
  console.log("Token0:", `${meta0.symbol} (${await token0.getAddress()})`);
  console.log("Token1:", `${meta1.symbol} (${await token1.getAddress()})`);
  console.log("Swap fee:", `${swapFeeBps.toString()} bps`);
  console.log("Protocol fee share:", `${protocolFeeShareBps.toString()} bps`);
  console.log("Reserve0:", formatToken(reserve0, meta0.decimals, meta0.symbol));
  console.log("Reserve1:", formatToken(reserve1, meta1.decimals, meta1.symbol));
  console.log("Protocol fees0:", formatToken(protocolFees0, meta0.decimals, meta0.symbol));
  console.log("Protocol fees1:", formatToken(protocolFees1, meta1.decimals, meta1.symbol));
  console.log("Total LP supply:", `${hre.ethers.formatEther(totalSupply)} sbSWAP-LP`);
  console.log("View LP shares:", `${hre.ethers.formatEther(viewLpShares)} sbSWAP-LP`);
  console.log("View token0 balance:", formatToken(viewToken0Balance, meta0.decimals, meta0.symbol));
  console.log("View token1 balance:", formatToken(viewToken1Balance, meta1.decimals, meta1.symbol));
  console.log("View token0 allowance:", formatToken(allowance0, meta0.decimals, meta0.symbol));
  console.log("View token1 allowance:", formatToken(allowance1, meta1.decimals, meta1.symbol));
}

async function requireOwner(pool, signer) {
  const owner = await pool.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not swap pool owner ${owner}. Use Safe calldata instead.`);
  }
}

async function main() {
  const action = parseAction();
  const networkName = hre.network.name;
  const deployment = readSwapDeployment(networkName);
  const poolAddress = resolvePoolAddress(networkName, deployment);
  const signers = await hre.ethers.getSigners();
  const signer = signers[0] || null;
  const runner = signer || hre.ethers.provider;
  const pool = await hre.ethers.getContractAt("SimpleSwapPool", poolAddress, runner);

  if (action === "status") {
    await printStatus(pool, poolAddress, resolveViewAddress(signer ? signer.address : hre.ethers.ZeroAddress), runner);
    return;
  }

  if (!signer) {
    throw new Error("No signer available. Check PRIVATE_KEY and network config.");
  }

  const token0 = await getToken(pool, 0, signer);
  const token1 = await getToken(pool, 1, signer);
  const [meta0, meta1] = await Promise.all([readTokenMeta(token0), readTokenMeta(token1)]);

  if (action === "approve") {
    const side = await resolveTokenSide(pool);
    const token = side === 0 ? token0 : token1;
    const meta = side === 0 ? meta0 : meta1;
    const amount = isTruthyEnv("APPROVE_MAX", false)
      ? hre.ethers.MaxUint256
      : parseTokenAmountEnv("SWAP_APPROVE_AMOUNT", meta.decimals);

    console.log(`Approving ${amount === hre.ethers.MaxUint256 ? "max" : formatToken(amount, meta.decimals, meta.symbol)}...`);
    const tx = await token.approve(poolAddress, amount);
    await tx.wait();
    console.log("Approval complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "wrap-token0") {
    const amount = parseTokenAmountEnv("WRAP_AMOUNT_ETH", 18);
    const token0Address = await token0.getAddress();
    const weth = new hre.ethers.Contract(token0Address, WETH_ABI, signer);

    console.log(`Wrapping ${hre.ethers.formatEther(amount)} ETH into token0 (${meta0.symbol})...`);
    const tx = await weth.deposit({ value: amount });
    await tx.wait();
    console.log("Wrap complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "add-liquidity") {
    const amount0 = parseTokenAmountEnv("SWAP_ADD_TOKEN0_AMOUNT", meta0.decimals);
    const amount1 = parseTokenAmountEnv("SWAP_ADD_TOKEN1_AMOUNT", meta1.decimals);
    const amount0Min = parseTokenAmountEnv("SWAP_MIN_TOKEN0_AMOUNT", meta0.decimals, "0");
    const amount1Min = parseTokenAmountEnv("SWAP_MIN_TOKEN1_AMOUNT", meta1.decimals, "0");
    const receiver = parseAddressEnv("RECEIVER", signer.address);

    if (isTruthyEnv("AUTO_APPROVE", true)) {
      await ensureAllowance(token0, signer, poolAddress, amount0, meta0.symbol);
      await ensureAllowance(token1, signer, poolAddress, amount1, meta1.symbol);
    }

    console.log(`Adding liquidity: ${formatToken(amount0, meta0.decimals, meta0.symbol)} + ${formatToken(amount1, meta1.decimals, meta1.symbol)}...`);
    const tx = await pool.addLiquidity(amount0, amount1, amount0Min, amount1Min, receiver);
    await tx.wait();
    console.log("Liquidity added.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "remove-liquidity") {
    const shares = isTruthyEnv("REMOVE_ALL")
      ? await pool.balanceOf(signer.address)
      : parseTokenAmountEnv("SWAP_LP_SHARES", 18);
    const amount0Min = parseTokenAmountEnv("SWAP_MIN_TOKEN0_AMOUNT", meta0.decimals, "0");
    const amount1Min = parseTokenAmountEnv("SWAP_MIN_TOKEN1_AMOUNT", meta1.decimals, "0");
    const receiver = parseAddressEnv("RECEIVER", signer.address);

    console.log(`Removing ${hre.ethers.formatEther(shares)} sbSWAP-LP...`);
    const tx = await pool.removeLiquidity(shares, amount0Min, amount1Min, receiver);
    await tx.wait();
    console.log("Liquidity removed.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "swap") {
    const side = await resolveTokenSide(pool);
    const inputToken = side === 0 ? token0 : token1;
    const inputMeta = side === 0 ? meta0 : meta1;
    const outputMeta = side === 0 ? meta1 : meta0;
    const tokenInAddress = await inputToken.getAddress();
    const amountIn = parseTokenAmountEnv("SWAP_AMOUNT_IN", inputMeta.decimals);
    const minAmountOut = parseTokenAmountEnv("SWAP_MIN_AMOUNT_OUT", outputMeta.decimals, "0");
    const receiver = parseAddressEnv("RECEIVER", signer.address);
    const quotedOut = await pool.getAmountOut(tokenInAddress, amountIn);

    if (isTruthyEnv("AUTO_APPROVE", true)) {
      await ensureAllowance(inputToken, signer, poolAddress, amountIn, inputMeta.symbol);
    }

    console.log(
      `Swapping ${formatToken(amountIn, inputMeta.decimals, inputMeta.symbol)} for about ${formatToken(
        quotedOut,
        outputMeta.decimals,
        outputMeta.symbol
      )}...`
    );
    const tx = await pool.swapExactTokensForTokens(tokenInAddress, amountIn, minAmountOut, receiver);
    await tx.wait();
    console.log("Swap complete.");
    console.log("Tx:", tx.hash);
    return;
  }

  if (action === "claim-fees") {
    await requireOwner(pool, signer);
    console.log("Claiming swap protocol fees...");
    const tx = await pool.claimProtocolFees();
    await tx.wait();
    console.log("Protocol fee claim complete.");
    console.log("Tx:", tx.hash);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Swap pool action failed:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
