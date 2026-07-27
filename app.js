// ===============================
// Simple Bank V2 - Stable Version
// ==============================

    let web3;
    let bankContract;
    let vaultContract;
    let managerContract;
    let lendingContract;
    let swapContract;
    let swapToken0Contract;
    let swapToken1Contract;
    let userAccount;
    let vaultShareDecimals = 18;
    let swapToken0Decimals = 18;
    let swapToken1Decimals = 18;
    let swapToken0Symbol = "Token0";
    let swapToken1Symbol = "Token1";
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
    const MAX_UINT256 = ((1n << 256n) - 1n).toString();
    const AAVE_RAY = 10n ** 27n;
    const SECONDS_PER_YEAR = 31536000;
    const ERC20_ABI = [
        {
            constant: true,
            inputs: [{ name: "account", type: "address" }],
            name: "balanceOf",
            outputs: [{ name: "", type: "uint256" }],
            type: "function"
        },
        {
            constant: true,
            inputs: [
                { name: "owner", type: "address" },
                { name: "spender", type: "address" }
            ],
            name: "allowance",
            outputs: [{ name: "", type: "uint256" }],
            type: "function"
        },
        {
            constant: false,
            inputs: [
                { name: "spender", type: "address" },
                { name: "amount", type: "uint256" }
            ],
            name: "approve",
            outputs: [{ name: "", type: "bool" }],
            type: "function"
        },
        {
            constant: true,
            inputs: [],
            name: "symbol",
            outputs: [{ name: "", type: "string" }],
            type: "function"
        },
        {
            constant: true,
            inputs: [],
            name: "decimals",
            outputs: [{ name: "", type: "uint8" }],
            type: "function"
        }
    ];
    
    // ===== DOM ELEMENTS =====
    const connectButton = document.getElementById('connectButton');
    const connectedAccountSpan = document.getElementById("connectedAccount");
    const userBalanceSpan = document.getElementById("userBalance");
    const contractBalanceSpan = document.getElementById("contractBalance");
    const refreshButton = document.getElementById("refreshButton");
    const depositButton = document.getElementById("depositButton");
    const withdrawButton = document.getElementById("withdrawButton");
    const claimInterestButton = document.getElementById("claimInterestButton");
    const refreshHistoryButton = document.getElementById("refreshHistoryButton");
    const transactionList = document.getElementById("transactionList");
    const interestRateSpan = document.getElementById("interestRate");
    const pendingInterestSpan = document.getElementById("pendingInterest");
    const depositAmountInput = document.getElementById("depositAmount");
    const withdrawAmountInput = document.getElementById("withdrawAmount");
    const txCountSpan = document.getElementById('txCount');
    const statusDiv = document.getElementById("status");
    const maxDepositButton = document.getElementById('maxDepositButton');
    const withdrawAllButton = document.getElementById('withdrawAllButton');
    const tvlSpan = document.getElementById('tvl');
    const depositorCountSpan = document.getElementById('depositorCount');
    const suiteDashboard = document.getElementById('suiteDashboard');
    const suiteOverallStatusElem = document.getElementById('suiteOverallStatus');
    const suiteOwnerAlignmentElem = document.getElementById('suiteOwnerAlignment');
    const suiteBankStatusElem = document.getElementById('suiteBankStatus');
    const suiteVaultStatusElem = document.getElementById('suiteVaultStatus');
    const suiteManagerStatusElem = document.getElementById('suiteManagerStatus');
    const suiteLendingStatusElem = document.getElementById('suiteLendingStatus');
    const suiteSwapStatusElem = document.getElementById('suiteSwapStatus');
    const suiteBankDepositsSpan = document.getElementById('suiteBankDeposits');
    const suiteBankReserveSpan = document.getElementById('suiteBankReserve');
    const suiteVaultAssetsSpan = document.getElementById('suiteVaultAssets');
    const suiteVaultStrategyAssetsSpan = document.getElementById('suiteVaultStrategyAssets');
    const suiteLendingAssetsSpan = document.getElementById('suiteLendingAssets');
    const suiteLendingDebtSpan = document.getElementById('suiteLendingDebt');
    const suiteSwapReservesElem = document.getElementById('suiteSwapReserves');
    const suiteSwapFeesElem = document.getElementById('suiteSwapFees');
    const suiteProtocolFeesSpan = document.getElementById('suiteProtocolFees');
    const suiteUserPositionSpan = document.getElementById('suiteUserPosition');
    const suiteRefreshButton = document.getElementById('suiteRefreshButton');
    const adminPanel = document.getElementById('adminPanel');
    const adminTreasurySpan = document.getElementById('adminTreasury');
    const adminProtocolFeesSpan = document.getElementById('adminProtocolFees');
    const adminInterestReserveSpan = document.getElementById('adminInterestReserve');
    const adminDepositFeeBpsSpan = document.getElementById('adminDepositFeeBps');
    const adminWithdrawalFeeBpsSpan = document.getElementById('adminWithdrawalFeeBps');
    const adminWithdrawalLockDaysSpan = document.getElementById('adminWithdrawalLockDays');
    const reserveAmountInput = document.getElementById('reserveAmount');
    const depositFeeBpsInput = document.getElementById('depositFeeBpsInput');
    const withdrawalFeeBpsInput = document.getElementById('withdrawalFeeBpsInput');
    const withdrawalLockDaysInput = document.getElementById('withdrawalLockDaysInput');
    const fundReserveButton = document.getElementById('fundReserveButton');
    const setDepositFeeButton = document.getElementById('setDepositFeeButton');
    const setWithdrawalFeeButton = document.getElementById('setWithdrawalFeeButton');
    const setWithdrawalLockButton = document.getElementById('setWithdrawalLockButton');
    const claimProtocolFeesButton = document.getElementById('claimProtocolFeesButton');
    const refreshAdminButton = document.getElementById('refreshAdminButton');
    const vaultPanel = document.getElementById('vaultPanel');
    const vaultUserSharesSpan = document.getElementById('vaultUserShares');
    const vaultUserAssetsSpan = document.getElementById('vaultUserAssets');
    const vaultTotalAssetsSpan = document.getElementById('vaultTotalAssets');
    const vaultSharePriceSpan = document.getElementById('vaultSharePrice');
    const vaultPendingYieldSpan = document.getElementById('vaultPendingYield');
    const vaultPerformanceFeeSpan = document.getElementById('vaultPerformanceFee');
    const vaultApyElem = document.getElementById('vaultApy');
    const vaultMaxAssetsElem = document.getElementById('vaultMaxAssets');
    const vaultOwnerSpan = document.getElementById('vaultOwner');
    const vaultTreasurySpan = document.getElementById('vaultTreasury');
    const vaultPausedStatusElem = document.getElementById('vaultPausedStatus');
    const vaultDepositAmountInput = document.getElementById('vaultDepositAmount');
    const vaultRedeemSharesInput = document.getElementById('vaultRedeemShares');
    const vaultDepositButton = document.getElementById('vaultDepositButton');
    const vaultRedeemButton = document.getElementById('vaultRedeemButton');
    const vaultRedeemAllButton = document.getElementById('vaultRedeemAllButton');
    const vaultRefreshButton = document.getElementById('vaultRefreshButton');
    const vaultHarvestButton = document.getElementById('vaultHarvestButton');
    const vaultOwnerActions = document.getElementById('vaultOwnerActions');
    const vaultPerformanceFeeBpsInput = document.getElementById('vaultPerformanceFeeBpsInput');
    const vaultMaxAssetsInput = document.getElementById('vaultMaxAssetsInput');
    const vaultTreasuryInput = document.getElementById('vaultTreasuryInput');
    const vaultSetPerformanceFeeButton = document.getElementById('vaultSetPerformanceFeeButton');
    const vaultSetMaxAssetsButton = document.getElementById('vaultSetMaxAssetsButton');
    const vaultSetTreasuryButton = document.getElementById('vaultSetTreasuryButton');
    const vaultPauseButton = document.getElementById('vaultPauseButton');
    const vaultUnpauseButton = document.getElementById('vaultUnpauseButton');
    const strategyManagerPanel = document.getElementById('strategyManagerPanel');
    const managerAddressSpan = document.getElementById('managerAddress');
    const managerVaultLinkStatusElem = document.getElementById('managerVaultLinkStatus');
    const managerOwnerSpan = document.getElementById('managerOwner');
    const managerAssetSpan = document.getElementById('managerAsset');
    const managerTotalAssetsSpan = document.getElementById('managerTotalAssets');
    const managerIdleAssetsSpan = document.getElementById('managerIdleAssets');
    const managerStrategyAssetsSpan = document.getElementById('managerStrategyAssets');
    const managerStrategyCountElem = document.getElementById('managerStrategyCount');
    const managerDefaultStrategySpan = document.getElementById('managerDefaultStrategy');
    const managerStrategyApprovedElem = document.getElementById('managerStrategyApproved');
    const managerStrategyCapElem = document.getElementById('managerStrategyCap');
    const managerStrategyCapacityElem = document.getElementById('managerStrategyCapacity');
    const managerAavePoolSpan = document.getElementById('managerAavePool');
    const managerAaveTokenSpan = document.getElementById('managerAaveToken');
    const managerAaveApyElem = document.getElementById('managerAaveApy');
    const managerRefreshButton = document.getElementById('managerRefreshButton');
    const managerOwnerActions = document.getElementById('managerOwnerActions');
    const managerStrategyInput = document.getElementById('managerStrategyInput');
    const managerStrategyCapInput = document.getElementById('managerStrategyCapInput');
    const managerSetStrategyCapButton = document.getElementById('managerSetStrategyCapButton');
    const managerDefaultStrategyInput = document.getElementById('managerDefaultStrategyInput');
    const managerSetDefaultStrategyButton = document.getElementById('managerSetDefaultStrategyButton');
    const managerDivestStrategyInput = document.getElementById('managerDivestStrategyInput');
    const managerDivestAllButton = document.getElementById('managerDivestAllButton');
    const managerFromStrategyInput = document.getElementById('managerFromStrategyInput');
    const managerToStrategyInput = document.getElementById('managerToStrategyInput');
    const managerRebalanceAmountInput = document.getElementById('managerRebalanceAmountInput');
    const managerRebalanceButton = document.getElementById('managerRebalanceButton');
    const lendingPanel = document.getElementById('lendingPanel');
    const lendingPoolAddressSpan = document.getElementById('lendingPoolAddress');
    const lendingOwnerSpan = document.getElementById('lendingOwner');
    const lendingTreasurySpan = document.getElementById('lendingTreasury');
    const lendingPausedStatusElem = document.getElementById('lendingPausedStatus');
    const lendingBorrowAprSpan = document.getElementById('lendingBorrowApr');
    const lendingOriginationFeeSpan = document.getElementById('lendingOriginationFee');
    const lendingMaxLtvSpan = document.getElementById('lendingMaxLtv');
    const lendingLiquidationThresholdSpan = document.getElementById('lendingLiquidationThreshold');
    const lendingLiquidationBonusSpan = document.getElementById('lendingLiquidationBonus');
    const lendingMaxPoolLiquidityElem = document.getElementById('lendingMaxPoolLiquidity');
    const lendingTotalAssetsSpan = document.getElementById('lendingTotalAssets');
    const lendingAvailableLiquiditySpan = document.getElementById('lendingAvailableLiquidity');
    const lendingTotalDebtSpan = document.getElementById('lendingTotalDebt');
    const lendingTotalCollateralSpan = document.getElementById('lendingTotalCollateral');
    const lendingProtocolFeesSpan = document.getElementById('lendingProtocolFees');
    const lendingUserSharesSpan = document.getElementById('lendingUserShares');
    const lendingUserSupplyAssetsSpan = document.getElementById('lendingUserSupplyAssets');
    const lendingUserCollateralSpan = document.getElementById('lendingUserCollateral');
    const lendingUserDebtSpan = document.getElementById('lendingUserDebt');
    const lendingBorrowCapacitySpan = document.getElementById('lendingBorrowCapacity');
    const lendingHealthFactorElem = document.getElementById('lendingHealthFactor');
    const lendingLiquidatableElem = document.getElementById('lendingLiquidatable');
    const lendingSupplyAmountInput = document.getElementById('lendingSupplyAmount');
    const lendingSupplyButton = document.getElementById('lendingSupplyButton');
    const lendingWithdrawSharesInput = document.getElementById('lendingWithdrawShares');
    const lendingWithdrawAllButton = document.getElementById('lendingWithdrawAllButton');
    const lendingWithdrawSupplyButton = document.getElementById('lendingWithdrawSupplyButton');
    const lendingCollateralAmountInput = document.getElementById('lendingCollateralAmount');
    const lendingBorrowAmountInput = document.getElementById('lendingBorrowAmount');
    const lendingDepositCollateralButton = document.getElementById('lendingDepositCollateralButton');
    const lendingBorrowButton = document.getElementById('lendingBorrowButton');
    const lendingBorrowWithCollateralButton = document.getElementById('lendingBorrowWithCollateralButton');
    const lendingRepayAmountInput = document.getElementById('lendingRepayAmount');
    const lendingRepayAllButton = document.getElementById('lendingRepayAllButton');
    const lendingRepayButton = document.getElementById('lendingRepayButton');
    const lendingWithdrawCollateralAmountInput = document.getElementById('lendingWithdrawCollateralAmount');
    const lendingWithdrawCollateralButton = document.getElementById('lendingWithdrawCollateralButton');
    const lendingLiquidateBorrowerInput = document.getElementById('lendingLiquidateBorrower');
    const lendingLiquidateRepayAmountInput = document.getElementById('lendingLiquidateRepayAmount');
    const lendingLiquidateButton = document.getElementById('lendingLiquidateButton');
    const lendingRefreshButton = document.getElementById('lendingRefreshButton');
    const lendingOwnerActions = document.getElementById('lendingOwnerActions');
    const lendingBorrowAprInput = document.getElementById('lendingBorrowAprInput');
    const lendingOriginationFeeInput = document.getElementById('lendingOriginationFeeInput');
    const lendingSetRatesButton = document.getElementById('lendingSetRatesButton');
    const lendingMaxLtvInput = document.getElementById('lendingMaxLtvInput');
    const lendingLiquidationThresholdInput = document.getElementById('lendingLiquidationThresholdInput');
    const lendingLiquidationBonusInput = document.getElementById('lendingLiquidationBonusInput');
    const lendingSetRiskButton = document.getElementById('lendingSetRiskButton');
    const lendingMaxLiquidityInput = document.getElementById('lendingMaxLiquidityInput');
    const lendingTreasuryInput = document.getElementById('lendingTreasuryInput');
    const lendingSetMaxLiquidityButton = document.getElementById('lendingSetMaxLiquidityButton');
    const lendingSetTreasuryButton = document.getElementById('lendingSetTreasuryButton');
    const lendingClaimFeesButton = document.getElementById('lendingClaimFeesButton');
    const lendingPauseButton = document.getElementById('lendingPauseButton');
    const lendingUnpauseButton = document.getElementById('lendingUnpauseButton');
    const swapPanel = document.getElementById('swapPanel');
    const swapPoolAddressSpan = document.getElementById('swapPoolAddress');
    const swapOwnerSpan = document.getElementById('swapOwner');
    const swapTreasurySpan = document.getElementById('swapTreasury');
    const swapPausedStatusElem = document.getElementById('swapPausedStatus');
    const swapToken0Elem = document.getElementById('swapToken0');
    const swapToken1Elem = document.getElementById('swapToken1');
    const swapFeeBpsSpan = document.getElementById('swapFeeBps');
    const swapProtocolShareBpsSpan = document.getElementById('swapProtocolShareBps');
    const swapReserve0Elem = document.getElementById('swapReserve0');
    const swapReserve1Elem = document.getElementById('swapReserve1');
    const swapProtocolFees0Elem = document.getElementById('swapProtocolFees0');
    const swapProtocolFees1Elem = document.getElementById('swapProtocolFees1');
    const swapTotalLpSupplySpan = document.getElementById('swapTotalLpSupply');
    const swapUserLpSharesSpan = document.getElementById('swapUserLpShares');
    const swapUserToken0BalanceElem = document.getElementById('swapUserToken0Balance');
    const swapUserToken1BalanceElem = document.getElementById('swapUserToken1Balance');
    const swapAddToken0AmountInput = document.getElementById('swapAddToken0Amount');
    const swapAddToken1AmountInput = document.getElementById('swapAddToken1Amount');
    const swapAddLiquidityButton = document.getElementById('swapAddLiquidityButton');
    const swapTokenInSelect = document.getElementById('swapTokenInSelect');
    const swapAmountInInput = document.getElementById('swapAmountIn');
    const swapMinAmountOutInput = document.getElementById('swapMinAmountOut');
    const swapQuoteElem = document.getElementById('swapQuote');
    const swapExecuteButton = document.getElementById('swapExecuteButton');
    const swapRemoveLpSharesInput = document.getElementById('swapRemoveLpShares');
    const swapRemoveAllButton = document.getElementById('swapRemoveAllButton');
    const swapRemoveLiquidityButton = document.getElementById('swapRemoveLiquidityButton');
    const swapRefreshButton = document.getElementById('swapRefreshButton');
    const swapOwnerActions = document.getElementById('swapOwnerActions');
    const swapFeeBpsInput = document.getElementById('swapFeeBpsInput');
    const swapProtocolShareBpsInput = document.getElementById('swapProtocolShareBpsInput');
    const swapTreasuryInput = document.getElementById('swapTreasuryInput');
    const swapSetFeeButton = document.getElementById('swapSetFeeButton');
    const swapSetProtocolShareButton = document.getElementById('swapSetProtocolShareButton');
    const swapSetTreasuryButton = document.getElementById('swapSetTreasuryButton');
    const swapClaimFeesButton = document.getElementById('swapClaimFeesButton');
    const swapPauseButton = document.getElementById('swapPauseButton');
    const swapUnpauseButton = document.getElementById('swapUnpauseButton');
    let statusClearTimer;
    let persistentStatusActive = false;
    
     // ==========================
     // HELPERS FUNCTIONS
     // ==========================

    function clearStatus() {
        if (statusDiv) {
            statusDiv.textContent = "";
            statusDiv.className = 'status info';
        }
        persistentStatusActive = false;
    }

    function showStatus(message, type = "info", duration = null) {
        if (persistentStatusActive && type === 'success' && message === 'Balances updated') {
            return;
        }

        if (statusClearTimer) {
            clearTimeout(statusClearTimer);
            statusClearTimer = undefined;
        }

        if (statusDiv) {
            const effectiveDuration = duration === null ? (type === 'error' ? 0 : 5000) : duration;
            persistentStatusActive = effectiveDuration === 0;
            statusDiv.className = `status ${type}`;
            statusDiv.replaceChildren();

            const messageSpan = document.createElement('span');
            messageSpan.className = 'status-message';
            messageSpan.textContent = message;
            statusDiv.appendChild(messageSpan);

            if (persistentStatusActive) {
                const closeButton = document.createElement('button');
                closeButton.type = 'button';
                closeButton.className = 'status-close';
                closeButton.setAttribute('aria-label', 'Dismiss message');
                closeButton.textContent = 'x';
                closeButton.addEventListener('click', clearStatus);
                statusDiv.appendChild(closeButton);
            } else if (effectiveDuration > 0) {
                statusClearTimer = setTimeout(() => {
                    const currentMessage = statusDiv.querySelector('.status-message')?.textContent;
                    if (currentMessage === message) {
                        clearStatus();
                    }
                }, effectiveDuration);
            }
        }

        console.log(`[${type.toUpperCase()}] ${message}`);
    }


    function setButtonLoading(button, isLoading, originalText = null) {
        if (!button) return;
        if (isLoading) {
            button.dataset.originalText = originalText || button.innerHTML;
            button.innerHTML = 'Processing...';
            button.disabled = true;
            button.classList.add('loading');
        } else {
            button.innerHTML = button.dataset.originalText || 'Submit';
            button.disabled = false;
            button.classList.remove('loading');
        }
    }

    function formatAddress(address) {
        if (!address) return "";
        return `${address.substring(0, 6)}...${address.substring(38)}`;
    }

    function setAddressText(element, address) {
        if (!element) return;
        if (!address || sameAddress(address, ZERO_ADDRESS)) {
            element.textContent = '-';
            element.removeAttribute('title');
            return;
        }

        element.textContent = formatAddress(address);
        element.title = address;
    }

    function formatEthFromWei(valueWei, decimals = 6) {
        return parseFloat(web3.utils.fromWei(valueWei.toString(), 'ether')).toFixed(decimals);
    }

    function formatUnits(value, decimals = 18, fractionDigits = 6) {
        const raw = BigInt(value || 0);
        const unit = 10n ** BigInt(decimals);
        const whole = raw / unit;
        const fraction = raw % unit;

        if (fractionDigits === 0) return whole.toString();

        const fractionText = fraction
            .toString()
            .padStart(Number(decimals), '0')
            .slice(0, fractionDigits)
            .padEnd(fractionDigits, '0');

        return `${whole.toString()}.${fractionText}`;
    }

    function formatTokenUnits(value, decimals, symbol, fractionDigits = 6) {
        return `${formatUnits(value, decimals, fractionDigits)} ${symbol}`;
    }

    function parseUnits(value, decimals = 18) {
        const normalized = value ? value.trim() : "";
        if (!/^\d+(\.\d+)?$/.test(normalized) || Number(normalized) <= 0) {
            throw new Error('Enter a valid positive amount');
        }

        const [wholePart, fractionPart = ""] = normalized.split('.');
        if (fractionPart.length > decimals) {
            throw new Error(`Amount supports up to ${decimals} decimals`);
        }

        return (
            BigInt(wholePart || "0") * (10n ** BigInt(decimals)) +
            BigInt(fractionPart.padEnd(decimals, '0') || "0")
        ).toString();
    }

    function formatBpsAsPercent(bps) {
        return (Number(bps || 0) / 100).toFixed(2) + '%';
    }

    function formatPercent(value) {
        if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
        return `${value.toFixed(2)}%`;
    }

    function isMaxUint(value) {
        return BigInt(value || 0) === ((1n << 256n) - 1n);
    }

    function formatHealthFactorBps(value) {
        if (isMaxUint(value)) return 'No debt';
        return `${(Number(value || 0) / 10000).toFixed(4)}x`;
    }

    function setStatusPill(element, text, state = 'neutral') {
        if (!element) return;
        element.textContent = text;
        element.classList.remove('ok', 'warn', 'bad', 'neutral');
        element.classList.add(state);
    }

    function addWei(first, second) {
        return (BigInt(first || 0) + BigInt(second || 0)).toString();
    }

    function subtractWei(first, second) {
        return (BigInt(first || 0) - BigInt(second || 0)).toString();
    }

    function clampWeiToZero(value) {
        const raw = BigInt(value || 0);
        return raw < 0n ? "0" : raw.toString();
    }

    function sameAddress(first, second) {
        return Boolean(first && second && first.toLowerCase() === second.toLowerCase());
    }

    function getAaveReserveDataCallData(assetAddress) {
        return web3.eth.abi.encodeFunctionCall({
            name: 'getReserveData',
            type: 'function',
            inputs: [{ type: 'address', name: 'asset' }]
        }, [assetAddress]);
    }

    function readAbiWord(hexValue, wordIndex) {
        if (!hexValue || hexValue === '0x') return null;
        const start = 2 + (wordIndex * 64);
        const end = start + 64;
        if (hexValue.length < end) return null;
        return BigInt(`0x${hexValue.slice(start, end)}`);
    }

    function rayRateToApyPercent(rateRay) {
        const rate = BigInt(rateRay || 0);
        if (rate === 0n) return 0;

        const apr = Number(rate) / Number(AAVE_RAY);
        return ((1 + (apr / SECONDS_PER_YEAR)) ** SECONDS_PER_YEAR - 1) * 100;
    }

    async function fetchAaveSupplyApyPercent() {
        if (!web3) return null;

        const managerNetwork = window.MANAGER_CONFIG?.network || {};
        const vaultNetwork = window.VAULT_CONFIG?.network || {};
        const poolAddress = managerNetwork.aavePool || vaultNetwork.aavePool;
        const assetAddress = managerNetwork.weth || vaultNetwork.weth;

        if (!poolAddress || !assetAddress || !web3.utils.isAddress(poolAddress) || !web3.utils.isAddress(assetAddress)) {
            return null;
        }

        try {
            const data = getAaveReserveDataCallData(assetAddress);
            const result = await web3.eth.call({ to: poolAddress, data });
            const currentLiquidityRate = readAbiWord(result, 2);
            return currentLiquidityRate === null ? null : rayRateToApyPercent(currentLiquidityRate);
        } catch (error) {
            console.warn('Aave APY lookup failed:', error);
            return null;
        }
    }

    function hasV3AdminMethods() {
        return Boolean(
            bankContract &&
            bankContract.methods.fundInterestReserve &&
            bankContract.methods.setDepositFeeBps &&
            bankContract.methods.setWithdrawalFeeBps &&
            bankContract.methods.claimProtocolFees
        );
    }

    function parseEthInput(input, label) {
        const value = input ? input.value.trim() : "";
        if (!value || Number(value) <= 0) {
            throw new Error(`${label} must be greater than zero`);
        }

        return web3.utils.toWei(value, 'ether');
    }

    function parseNonNegativeEthInput(input, label) {
        const value = input ? input.value.trim() : "";
        if (!/^\d+(\.\d+)?$/.test(value)) {
            throw new Error(`${label} must be a non-negative ETH amount`);
        }

        return web3.utils.toWei(value, 'ether');
    }

    function parseAddressInput(input, label) {
        const value = input ? input.value.trim() : "";
        if (!web3.utils.isAddress(value) || sameAddress(value, ZERO_ADDRESS)) {
            throw new Error(`${label} must be a non-zero address`);
        }

        return value;
    }

    function parseOptionalStrategyAddressInput(input, label) {
        const value = input ? input.value.trim() : "";
        if (!value || value === "0" || sameAddress(value, ZERO_ADDRESS)) return ZERO_ADDRESS;
        if (!web3.utils.isAddress(value)) {
            throw new Error(`${label} must be an address or zero address`);
        }

        return value;
    }

    function parseBpsInput(input, label, maxBps) {
        const value = input ? input.value.trim() : "";
        if (!/^\d+$/.test(value)) {
            throw new Error(`${label} must be a whole basis-point value`);
        }

        const bps = BigInt(value);
        if (bps > BigInt(maxBps)) {
            throw new Error(`${label} cannot exceed ${maxBps} bps`);
        }

        return bps.toString();
    }

    async function parseFeeBpsInput(input, label) {
        const value = input ? input.value.trim() : "";
        if (!/^\d+$/.test(value)) {
            throw new Error(`${label} must be a whole basis-point value`);
        }

        const feeBps = BigInt(value);
        const maxFeeBps = bankContract.methods.MAX_FEE_BPS
            ? BigInt(await bankContract.methods.MAX_FEE_BPS().call())
            : 100n;

        if (feeBps > maxFeeBps) {
            throw new Error(`${label} cannot exceed ${maxFeeBps.toString()} bps`);
        }

        return feeBps.toString();
    }

    async function parseVaultPerformanceFeeBpsInput() {
        const value = vaultPerformanceFeeBpsInput ? vaultPerformanceFeeBpsInput.value.trim() : "";
        if (!/^\d+$/.test(value)) {
            throw new Error('Vault performance fee must be a whole basis-point value');
        }

        const feeBps = BigInt(value);
        const maxFeeBps = vaultContract.methods.MAX_PERFORMANCE_FEE_BPS
            ? BigInt(await vaultContract.methods.MAX_PERFORMANCE_FEE_BPS().call())
            : 2000n;

        if (feeBps > maxFeeBps) {
            throw new Error(`Vault performance fee cannot exceed ${maxFeeBps.toString()} bps`);
        }

        return feeBps.toString();
    }

    async function parseWithdrawalLockDaysInput() {
        const value = withdrawalLockDaysInput ? withdrawalLockDaysInput.value.trim() : "";
        if (!/^\d+$/.test(value)) {
            throw new Error('Withdrawal lock must be a whole day value');
        }

        const daysLock = BigInt(value);
        const [minDays, maxDays] = await Promise.all([
            bankContract.methods.MIN_WITHDRAWAL_LOCK_DAYS().call(),
            bankContract.methods.MAX_WITHDRAWAL_LOCK_DAYS().call()
        ]);

        if (daysLock < BigInt(minDays) || daysLock > BigInt(maxDays)) {
            throw new Error(`Withdrawal lock must be between ${minDays} and ${maxDays} days`);
        }

        return daysLock.toString();
    }

    async function resolveContractConfig() {
        const config = window.CONTRACT_CONFIG;
        if (!config || !config.abi || !config.networks) {
            throw new Error('Contract config not loaded');
        }

        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        const chainId = Number.parseInt(chainIdHex, 16);
        const network = config.networks[chainId];

        if (!network) {
            throw new Error(`Unsupported network ${chainId}. Switch to Sepolia or Ethereum Mainnet.`);
        }

        if (!network.contractAddress) {
            throw new Error(`No SimpleBank address configured for ${network.chainName}`);
        }

        config.address = network.contractAddress;
        config.network = network;

        return config;
    }

    async function resolveVaultConfig() {
        const config = window.VAULT_CONFIG;
        if (!config || !config.abi || !config.networks) {
            return null;
        }

        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        const chainId = Number.parseInt(chainIdHex, 16);
        const network = config.networks[chainId];

        if (!network || !network.contractAddress) {
            return null;
        }

        config.address = network.contractAddress;
        config.network = network;

        return config;
    }

    async function resolveManagerConfig() {
        const config = window.MANAGER_CONFIG;
        if (!config || !config.abi || !config.networks) {
            return null;
        }

        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        const chainId = Number.parseInt(chainIdHex, 16);
        const network = config.networks[chainId];

        if (!network || !network.contractAddress) {
            return null;
        }

        config.address = network.contractAddress;
        config.network = network;

        return config;
    }

    async function resolveLendingConfig() {
        const config = window.LENDING_CONFIG;
        if (!config || !config.abi || !config.networks) {
            return null;
        }

        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        const chainId = Number.parseInt(chainIdHex, 16);
        const network = config.networks[chainId];

        if (!network || !network.contractAddress) {
            return null;
        }

        config.address = network.contractAddress;
        config.network = network;

        return config;
    }

    async function resolveSwapConfig() {
        const config = window.SWAP_CONFIG;
        if (!config || !config.abi || !config.networks) {
            return null;
        }

        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        const chainId = Number.parseInt(chainIdHex, 16);
        const network = config.networks[chainId];

        if (!network || !network.contractAddress) {
            return null;
        }

        config.address = network.contractAddress;
        config.network = network;

        return config;
    }

    function getDeploymentBlock() {
        return window.CONTRACT_CONFIG?.network?.deploymentBlock || 0;
    }

    function getExplorerTxUrl(txHash) {
        const config = window.CONTRACT_CONFIG;
        if (config?.explorerTxUrl) return config.explorerTxUrl(txHash);

        const explorer = config?.network?.blockExplorerUrls?.[0] || 'https://sepolia.etherscan.io';
        return `${explorer}/tx/${txHash}`;
    }

    async function getReadableEventRange() {
        const latestBlock = Number(await web3.eth.getBlockNumber());
        const deploymentBlock = Number(getDeploymentBlock());
        return {
            latestBlock,
            fromBlock: deploymentBlock > 0 ? deploymentBlock : Math.max(0, latestBlock - 100)
        };
    }

    async function getPastEventsWithFallback(eventName, options = {}) {
        const { latestBlock, fromBlock } = await getReadableEventRange();
        const baseOptions = {
            ...options,
            fromBlock,
            toBlock: latestBlock
        };

        try {
            return await bankContract.getPastEvents(eventName, baseOptions);
        } catch (primaryError) {
            console.warn(`${eventName} full history unavailable, trying recent block window`, primaryError);
            const recentFromBlock = Math.max(0, latestBlock - 100);
            return bankContract.getPastEvents(eventName, {
                ...options,
                fromBlock: recentFromBlock,
                toBlock: latestBlock
            });
        }
    }

    function showTransactionLink(txHash) {
        if (!txHash) return;
        showStatus(`View on Etherscan: ${getExplorerTxUrl(txHash)}`, 'info', 8000);
    }

    
    // ===== BUTTON ORIGINAL TEXTS =====
    const originalButtonTexts = {
        connect: connectButton ? connectButton.innerHTML : "Connect MetaMask",
        deposit: depositButton ? depositButton.innerHTML : "Deposit",
        withdraw: withdrawButton ? withdrawButton.innerHTML : "Withdraw",
        claim: claimInterestButton ? claimInterestButton.innerHTML : "Claim Interest",
        refresh: refreshButton ? refreshButton.innerHTML : "Refresh",
        refreshHistory: refreshHistoryButton ? refreshHistoryButton.innerHTML : "Refresh History"
    };

    // ==========================
    // CONNECT WALLET
    // ==========================
    async function connectWallet() {
        setButtonLoading(connectButton, true, 'Connect Metamask');
        showStatus('Connecting to MetaMask...', 'info');
        
        if (typeof window.ethereum === 'undefined') {
            showStatus("MetaMask not detected!", "error");
            setButtonLoading(connectButton, false);
            return;
        }

        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            userAccount = accounts[0];

            if (connectButton) {
                connectButton.innerHTML = `${formatAddress(userAccount)}`;
                connectButton.disabled = true;
            }
            if (connectedAccountSpan) {
                connectedAccountSpan.textContent = formatAddress(userAccount);
            }

            web3 = new Web3(window.ethereum);

            const config = await resolveContractConfig();

            bankContract = new web3.eth.Contract(config.abi, config.address);
            const vaultConfig = await resolveVaultConfig();
            vaultContract = vaultConfig ? new web3.eth.Contract(vaultConfig.abi, vaultConfig.address) : null;
            const managerConfig = await resolveManagerConfig();
            managerContract = managerConfig ? new web3.eth.Contract(managerConfig.abi, managerConfig.address) : null;
            const lendingConfig = await resolveLendingConfig();
            lendingContract = lendingConfig ? new web3.eth.Contract(lendingConfig.abi, lendingConfig.address) : null;
            const swapConfig = await resolveSwapConfig();
            swapContract = swapConfig ? new web3.eth.Contract(swapConfig.abi, swapConfig.address) : null;

            showStatus("Wallet connected successfully!", "success");

            await Promise.all([
                 updateBalances(),
                 updateSuiteDashboard({ silent: true }),
                 updateVaultPanel({ silent: true }),
                 updateStrategyManagerPanel({ silent: true }),
                 updateLendingPanel({ silent: true }),
                 updateSwapPanel({ silent: true }),
                 loadTransactionHistory({ silent: true }),
                 startAutoRefresh()
                ]);

            window.ethereum.on("accountsChanged", handleAccountsChanged);
            window.ethereum.on("chainChanged", () => window.location.reload());

        } catch (error) {
            console.error('Connection error:', error);
            showStatus(`Connection failed: ${error.message}`, 'error');
            setButtonLoading(connectButton, false);
        }
    }

    // ==========================
    // UPDATE BALANCES
    // ==========================
    async function updateBalances(options = {}) {
        const silent = options && options.silent === true;
        if (!bankContract || !userAccount) return;

        if (!silent) setButtonLoading(refreshButton, true, 'Refresh');
        try {
            const interestCall = bankContract.methods.getClaimableInterest
                ? bankContract.methods.getClaimableInterest(userAccount).call({from: userAccount})
                : bankContract.methods.getPendingInterest(userAccount).call({from: userAccount});

            const [userBalanceWei, contractBalanceWei, pendingInterestWei, interestRateBasis] = await Promise.all([
            bankContract.methods.getBalance().call({ from: userAccount }),
            bankContract.methods.getContractBalance().call(),
            interestCall,
            bankContract.methods.interestRate().call()
            ]);

            const userBalanceEth = web3.utils.fromWei(userBalanceWei, 'ether');
            const contractBalanceEth = web3.utils.fromWei(contractBalanceWei, 'ether');
            const pendingInterestEth = web3.utils.fromWei(pendingInterestWei, 'ether');
            const interestRatePercent = (Number(interestRateBasis) /100).toFixed(2);

            if (userBalanceSpan) userBalanceSpan.textContent = parseFloat(userBalanceEth).toFixed(6);
            if (contractBalanceSpan) contractBalanceSpan.textContent = parseFloat(contractBalanceEth).toFixed(6);
            if (pendingInterestSpan) pendingInterestSpan.textContent = parseFloat(pendingInterestEth).toFixed(6);
            if (interestRateSpan) interestRateSpan.textContent = interestRatePercent;
            if (tvlSpan) tvlSpan.textContent = parseFloat(contractBalanceEth).toFixed(6);

            if (parseFloat(pendingInterestEth) > 0) {
            showStatus(`You have ${parseFloat(pendingInterestEth).toFixed(6)} ETH pending interest!`, 'success', 3000);
            }

                
            const userBalanceNum = parseFloat(web3.utils.fromWei(userBalanceWei, 'ether'));
            const rate = Number(interestRateBasis) / 100;
         if (userBalanceNum > 0) {
            
            const oneDay = (userBalanceNum * rate * 1) / 365;
            const sevenDays = (userBalanceNum * rate * 7) /365;
            const thirtyDays = (userBalanceNum * rate * 30) / 365;

            document.getElementById('interest1Day').textContent = oneDay.toFixed(6) + 'ETH';
            document.getElementById('interest7Days').textContent = sevenDays.toFixed(6) + 'ETH';
            document.getElementById('interest30Days').textContent = thirtyDays.toFixed(6) + 'ETH';
        } else {
            document.getElementById('interest1Day').textContent = '0 ETH';
            document.getElementById('interest7Days').textContent = '0 ETH';
            document.getElementById('interest30Days').textContent = '0 ETH';
        }
        if (bankContract.methods.maxDeposit) {
            try {
            const maxWei = await bankContract.methods.maxDeposit().call();
            const maxEth = web3.utils.fromWei(maxWei, 'ether');
            const maxDepositElem = document.getElementById('maxDepositDisplay');
            if (maxDepositElem) maxDepositElem.textContent = parseFloat(maxEth).toFixed(6) + 'ETH';
            } catch (e) {
                   console.warn('Could not fetch maxDeposit', e);    
            }
        }

        if (bankContract.methods.minDeposit) {
           try {
            const minWei = await bankContract.methods.minDeposit().call();
            const minEth = web3.utils.fromWei(minWei, 'ether');
            const minDepositElem = document.getElementById('minDepositDisplay');
            if (minDepositElem) minDepositElem.textContent = parseFloat(minEth).toFixed(6) + 'ETH';
        } catch (e) {
            console.warn('Could not fetch minDeposit', e);
        }
        }

        if (bankContract.methods.maxTotalDeposits) {
            try {
                const maxTotalWei = await bankContract.methods.maxTotalDeposits().call();
                const maxTotalElem = document.getElementById('maxTotalDepositsDisplay');
                if (maxTotalElem) {
                    maxTotalElem.textContent = BigInt(maxTotalWei) === 0n
                        ? 'No cap'
                        : parseFloat(web3.utils.fromWei(maxTotalWei, 'ether')).toFixed(6) + 'ETH';
                }
            } catch (e) {
                console.warn('Could not fetch maxTotalDeposits', e);
            }
        }

        await updateUniqueDepositors();
        await updateAdminPanel({ silent: true });

             if (!silent) showStatus('Balances updated', 'success', 2000);
             
        } catch (error) {
            console.error('Balance update error:', error);
            if (!silent) showStatus(`Failed to update balances: ${error.message}`, 'error');
        } finally {
            if (!silent) setButtonLoading(refreshButton, false);
        }
    }

    // ==========================
    // SUITE DASHBOARD
    // ==========================
    async function updateSuiteDashboard(options = {}) {
        const silent = options && options.silent === true;
        if (!suiteDashboard) return;

        if (!bankContract || !userAccount) {
            suiteDashboard.hidden = true;
            return;
        }

        suiteDashboard.hidden = false;
        if (!silent) setButtonLoading(suiteRefreshButton, true, 'Refresh Suite');

        const bankState = {
            ok: false,
            owner: null,
            paused: false,
            totalDeposits: "0",
            interestReserve: "0",
            protocolFees: "0",
            userAssets: "0"
        };
        const vaultState = {
            ok: false,
            owner: null,
            paused: false,
            totalAssets: "0",
            strategyAssets: "0",
            userAssets: "0",
            treasuryAssets: "0"
        };
        const managerState = {
            ok: false,
            owner: null,
            defaultStrategy: ZERO_ADDRESS,
            vaultLinked: false
        };
        const lendingState = {
            ok: false,
            owner: null,
            paused: false,
            totalAssets: "0",
            totalBorrowDebt: "0",
            protocolFees: "0",
            userSupplyAssets: "0",
            userCollateral: "0",
            userDebt: "0"
        };
        const swapState = {
            ok: false,
            owner: null,
            paused: false,
            reserve0: "0",
            reserve1: "0",
            protocolFees0: "0",
            protocolFees1: "0",
            token0Symbol: window.SWAP_CONFIG?.network?.token0Symbol || "Token0",
            token1Symbol: window.SWAP_CONFIG?.network?.token1Symbol || "Token1",
            token0Decimals: Number(window.SWAP_CONFIG?.network?.token0Decimals || 18),
            token1Decimals: Number(window.SWAP_CONFIG?.network?.token1Decimals || 18)
        };

        try {
            const [
                owner,
                paused,
                totalDeposits,
                interestReserve,
                protocolFees,
                userAssets
            ] = await Promise.all([
                bankContract.methods.owner().call(),
                bankContract.methods.paused ? bankContract.methods.paused().call() : Promise.resolve(false),
                bankContract.methods.totalDeposits ? bankContract.methods.totalDeposits().call() : Promise.resolve("0"),
                bankContract.methods.interestReserve ? bankContract.methods.interestReserve().call() : Promise.resolve("0"),
                bankContract.methods.protocolFees ? bankContract.methods.protocolFees().call() : Promise.resolve("0"),
                bankContract.methods.getBalanceOf
                    ? bankContract.methods.getBalanceOf(userAccount).call()
                    : bankContract.methods.getBalance().call({ from: userAccount })
            ]);

            Object.assign(bankState, {
                ok: true,
                owner,
                paused: paused === true || paused === "true",
                totalDeposits,
                interestReserve,
                protocolFees,
                userAssets
            });
        } catch (error) {
            console.warn('Suite bank read failed:', error);
        }

        if (vaultContract) {
            try {
                const [
                    owner,
                    treasury,
                    paused,
                    totalAssets,
                    strategyAssets,
                    userShares
                ] = await Promise.all([
                    vaultContract.methods.owner().call(),
                    vaultContract.methods.treasury().call(),
                    vaultContract.methods.paused().call(),
                    vaultContract.methods.totalAssets().call(),
                    vaultContract.methods.strategyAssets
                        ? vaultContract.methods.strategyAssets().call()
                        : Promise.resolve("0"),
                    vaultContract.methods.balanceOf(userAccount).call()
                ]);

                const [userAssets, treasuryShares] = await Promise.all([
                    BigInt(userShares || 0) === 0n
                        ? Promise.resolve("0")
                        : vaultContract.methods.convertToAssets(userShares).call(),
                    vaultContract.methods.balanceOf(treasury).call()
                ]);
                const treasuryAssets = BigInt(treasuryShares || 0) === 0n
                    ? "0"
                    : await vaultContract.methods.convertToAssets(treasuryShares).call();

                Object.assign(vaultState, {
                    ok: true,
                    owner,
                    paused: paused === true || paused === "true",
                    totalAssets,
                    strategyAssets,
                    userAssets,
                    treasuryAssets
                });
            } catch (error) {
                console.warn('Suite vault read failed:', error);
            }
        }

        if (managerContract) {
            try {
                const [owner, defaultStrategy] = await Promise.all([
                    managerContract.methods.owner().call(),
                    managerContract.methods.defaultStrategy().call()
                ]);

                let vaultLinked = false;
                if (vaultContract && vaultContract.methods.strategy) {
                    try {
                        const vaultStrategy = await vaultContract.methods.strategy().call();
                        vaultLinked = sameAddress(vaultStrategy, window.MANAGER_CONFIG?.address);
                    } catch (error) {
                        console.warn('Suite vault strategy link read failed:', error);
                    }
                }

                Object.assign(managerState, {
                    ok: true,
                    owner,
                    defaultStrategy,
                    vaultLinked
                });
            } catch (error) {
                console.warn('Suite manager read failed:', error);
            }
        }

        if (lendingContract) {
            try {
                const [
                    owner,
                    paused,
                    totalAssets,
                    totalBorrowDebt,
                    protocolFees,
                    userSupplyAssets,
                    loan,
                    userDebt
                ] = await Promise.all([
                    lendingContract.methods.owner().call(),
                    lendingContract.methods.paused().call(),
                    lendingContract.methods.totalAssets().call(),
                    lendingContract.methods.totalBorrowDebt().call(),
                    lendingContract.methods.protocolFees().call(),
                    lendingContract.methods.supplyBalanceOf(userAccount).call(),
                    lendingContract.methods.loans(userAccount).call(),
                    lendingContract.methods.previewDebt(userAccount).call()
                ]);

                Object.assign(lendingState, {
                    ok: true,
                    owner,
                    paused: paused === true || paused === "true",
                    totalAssets,
                    totalBorrowDebt,
                    protocolFees,
                    userSupplyAssets,
                    userCollateral: loan.collateral || loan[0] || "0",
                    userDebt
                });
            } catch (error) {
                console.warn('Suite lending read failed:', error);
            }
        }

        if (swapContract) {
            try {
                const [
                    owner,
                    paused,
                    reserve0,
                    reserve1,
                    protocolFees0,
                    protocolFees1,
                    token0Symbol,
                    token1Symbol,
                    token0Decimals,
                    token1Decimals
                ] = await Promise.all([
                    swapContract.methods.owner().call(),
                    swapContract.methods.paused().call(),
                    swapContract.methods.reserve0().call(),
                    swapContract.methods.reserve1().call(),
                    swapContract.methods.protocolFees0().call(),
                    swapContract.methods.protocolFees1().call(),
                    swapContract.methods.token0Symbol().call(),
                    swapContract.methods.token1Symbol().call(),
                    swapContract.methods.token0Decimals().call(),
                    swapContract.methods.token1Decimals().call()
                ]);

                Object.assign(swapState, {
                    ok: true,
                    owner,
                    paused: paused === true || paused === "true",
                    reserve0,
                    reserve1,
                    protocolFees0,
                    protocolFees1,
                    token0Symbol,
                    token1Symbol,
                    token0Decimals: Number(token0Decimals),
                    token1Decimals: Number(token1Decimals)
                });
            } catch (error) {
                console.warn('Suite swap read failed:', error);
            }
        }

        const ownerAddresses = [
            bankState.owner,
            vaultState.owner,
            managerState.owner,
            lendingState.owner,
            swapState.owner
        ].filter(Boolean);
        const ownerAligned = ownerAddresses.length > 1
            ? ownerAddresses.every((owner) => sameAddress(owner, ownerAddresses[0]))
            : ownerAddresses.length === 1;

        const managerHasDefault = !sameAddress(managerState.defaultStrategy, ZERO_ADDRESS);
        const moduleWarnings = [
            bankState.ok && bankState.paused,
            vaultState.ok && vaultState.paused,
            lendingState.ok && lendingState.paused,
            swapState.ok && swapState.paused,
            managerState.ok && !managerHasDefault
        ].filter(Boolean).length;
        const unavailableModules = [bankState, vaultState, managerState, lendingState, swapState]
            .filter((moduleState) => !moduleState.ok).length;

        setStatusPill(
            suiteBankStatusElem,
            bankState.ok ? (bankState.paused ? 'Paused' : 'Active') : 'Unavailable',
            bankState.ok ? (bankState.paused ? 'warn' : 'ok') : 'bad'
        );
        setStatusPill(
            suiteVaultStatusElem,
            vaultState.ok ? (vaultState.paused ? 'Paused' : 'Active') : 'Unavailable',
            vaultState.ok ? (vaultState.paused ? 'warn' : 'ok') : 'bad'
        );
        setStatusPill(
            suiteManagerStatusElem,
            managerState.ok
                ? (!managerHasDefault ? 'No Default' : (managerState.vaultLinked ? 'Linked' : 'Check Link'))
                : 'Unavailable',
            managerState.ok
                ? (!managerHasDefault ? 'warn' : (managerState.vaultLinked ? 'ok' : 'warn'))
                : 'bad'
        );
        setStatusPill(
            suiteLendingStatusElem,
            lendingState.ok ? (lendingState.paused ? 'Paused' : 'Active') : 'Unavailable',
            lendingState.ok ? (lendingState.paused ? 'warn' : 'ok') : 'bad'
        );
        setStatusPill(
            suiteSwapStatusElem,
            swapState.ok ? (swapState.paused ? 'Paused' : 'Active') : 'Unavailable',
            swapState.ok ? (swapState.paused ? 'warn' : 'ok') : 'bad'
        );

        if (!ownerAligned) {
            setStatusPill(suiteOwnerAlignmentElem, 'Mismatch', 'bad');
        } else if (ownerAddresses.length > 1) {
            setStatusPill(suiteOwnerAlignmentElem, 'Aligned', 'ok');
        } else {
            setStatusPill(suiteOwnerAlignmentElem, 'Single Owner', 'neutral');
        }

        const overallBad = !bankState.ok || !ownerAligned;
        const overallWarningCount = moduleWarnings + unavailableModules + (managerState.ok && !managerState.vaultLinked ? 1 : 0);
        setStatusPill(
            suiteOverallStatusElem,
            overallBad
                ? 'Needs Review'
                : (overallWarningCount > 0 ? `${overallWarningCount} Warning${overallWarningCount === 1 ? '' : 's'}` : 'Healthy'),
            overallBad ? 'bad' : (overallWarningCount > 0 ? 'warn' : 'ok')
        );

        const lendingNetPosition = clampWeiToZero(
            subtractWei(addWei(lendingState.userSupplyAssets, lendingState.userCollateral), lendingState.userDebt)
        );
        const userSuitePosition = addWei(addWei(bankState.userAssets, vaultState.userAssets), lendingNetPosition);
        const suiteFees = addWei(addWei(bankState.protocolFees, lendingState.protocolFees), vaultState.treasuryAssets);

        if (suiteBankDepositsSpan) suiteBankDepositsSpan.textContent = formatUnits(bankState.totalDeposits, 18, 6);
        if (suiteBankReserveSpan) suiteBankReserveSpan.textContent = formatUnits(bankState.interestReserve, 18, 6);
        if (suiteVaultAssetsSpan) suiteVaultAssetsSpan.textContent = formatUnits(vaultState.totalAssets, 18, 6);
        if (suiteVaultStrategyAssetsSpan) suiteVaultStrategyAssetsSpan.textContent = formatUnits(vaultState.strategyAssets, 18, 6);
        if (suiteLendingAssetsSpan) suiteLendingAssetsSpan.textContent = formatUnits(lendingState.totalAssets, 18, 6);
        if (suiteLendingDebtSpan) suiteLendingDebtSpan.textContent = formatUnits(lendingState.totalBorrowDebt, 18, 6);
        if (suiteSwapReservesElem) {
            suiteSwapReservesElem.textContent = swapState.ok
                ? `${formatTokenUnits(swapState.reserve0, swapState.token0Decimals, swapState.token0Symbol)} / ${formatTokenUnits(
                    swapState.reserve1,
                    swapState.token1Decimals,
                    swapState.token1Symbol
                )}`
                : '-';
        }
        if (suiteSwapFeesElem) {
            suiteSwapFeesElem.textContent = swapState.ok
                ? `${formatTokenUnits(swapState.protocolFees0, swapState.token0Decimals, swapState.token0Symbol)} / ${formatTokenUnits(
                    swapState.protocolFees1,
                    swapState.token1Decimals,
                    swapState.token1Symbol
                )}`
                : '-';
        }
        if (suiteProtocolFeesSpan) suiteProtocolFeesSpan.textContent = formatUnits(suiteFees, 18, 6);
        if (suiteUserPositionSpan) suiteUserPositionSpan.textContent = formatUnits(userSuitePosition, 18, 6);

        if (!silent) {
            setButtonLoading(suiteRefreshButton, false);
            showStatus('Suite dashboard updated', 'success', 2000);
        }
    }

    // ==========================
    // OWNER ADMIN PANEL
    // ==========================
    async function updateAdminPanel(options = {}) {
        const silent = options && options.silent === true;
        if (!adminPanel) return;

        if (!bankContract || !userAccount || !hasV3AdminMethods()) {
            adminPanel.hidden = true;
            return;
        }

        try {
            const ownerAddress = await bankContract.methods.owner().call();
            const isOwner = sameAddress(ownerAddress, userAccount);
            adminPanel.hidden = !isOwner;

            if (!isOwner) return;

            const [
                treasury,
                protocolFeesWei,
                interestReserveWei,
                depositFeeBps,
                withdrawalFeeBps,
                withdrawalLockDays
            ] = await Promise.all([
                bankContract.methods.treasury().call(),
                bankContract.methods.protocolFees().call(),
                bankContract.methods.interestReserve().call(),
                bankContract.methods.depositFeeBps().call(),
                bankContract.methods.withdrawalFeeBps().call(),
                bankContract.methods.withdrawalLockDays().call()
            ]);

            if (adminTreasurySpan) adminTreasurySpan.textContent = formatAddress(treasury);
            if (adminProtocolFeesSpan) adminProtocolFeesSpan.textContent = formatEthFromWei(protocolFeesWei);
            if (adminInterestReserveSpan) adminInterestReserveSpan.textContent = formatEthFromWei(interestReserveWei);
            if (adminDepositFeeBpsSpan) adminDepositFeeBpsSpan.textContent = depositFeeBps;
            if (adminWithdrawalFeeBpsSpan) adminWithdrawalFeeBpsSpan.textContent = withdrawalFeeBps;
            if (adminWithdrawalLockDaysSpan) adminWithdrawalLockDaysSpan.textContent = withdrawalLockDays;

            if (depositFeeBpsInput && document.activeElement !== depositFeeBpsInput) {
                depositFeeBpsInput.value = depositFeeBps;
            }
            if (withdrawalFeeBpsInput && document.activeElement !== withdrawalFeeBpsInput) {
                withdrawalFeeBpsInput.value = withdrawalFeeBps;
            }
            if (withdrawalLockDaysInput && document.activeElement !== withdrawalLockDaysInput) {
                withdrawalLockDaysInput.value = withdrawalLockDays;
            }

            if (!silent) showStatus('Owner panel updated', 'success', 2000);
        } catch (error) {
            console.error('Admin panel update error:', error);
            if (!silent) showStatus(`Owner panel update failed: ${error.message}`, 'error');
        }
    }

    // ==========================
    // WETH YIELD VAULT
    // ==========================
    async function updateVaultPanel(options = {}) {
        const silent = options && options.silent === true;
        if (!vaultPanel) return;

        if (!vaultContract || !userAccount) {
            vaultPanel.hidden = true;
            return;
        }

        vaultPanel.hidden = false;

        try {
            const [
                decimals,
                totalAssets,
                totalSupply,
                accountedAssets,
                performanceFeeBps,
                maxTotalAssets,
                userShares,
                ownerAddress,
                treasuryAddress,
                isPaused
            ] = await Promise.all([
                vaultContract.methods.decimals().call(),
                vaultContract.methods.totalAssets().call(),
                vaultContract.methods.totalSupply().call(),
                vaultContract.methods.accountedAssets().call(),
                vaultContract.methods.performanceFeeBps().call(),
                vaultContract.methods.maxTotalAssets().call(),
                vaultContract.methods.balanceOf(userAccount).call(),
                vaultContract.methods.owner().call(),
                vaultContract.methods.treasury().call(),
                vaultContract.methods.paused().call()
            ]);

            vaultShareDecimals = Number(decimals);
            const userAssets = BigInt(userShares) === 0n
                ? "0"
                : await vaultContract.methods.convertToAssets(userShares).call();
            const oneShare = (10n ** BigInt(vaultShareDecimals)).toString();
            const sharePrice = BigInt(totalSupply) === 0n
                ? web3.utils.toWei('1', 'ether')
                : await vaultContract.methods.convertToAssets(oneShare).call();
            const pendingYield = BigInt(totalAssets) > BigInt(accountedAssets)
                ? (BigInt(totalAssets) - BigInt(accountedAssets)).toString()
                : "0";
            const aaveSupplyApy = await fetchAaveSupplyApyPercent();

            if (vaultUserSharesSpan) vaultUserSharesSpan.textContent = formatUnits(userShares, vaultShareDecimals, 6);
            if (vaultUserAssetsSpan) vaultUserAssetsSpan.textContent = formatUnits(userAssets, 18, 6);
            if (vaultTotalAssetsSpan) vaultTotalAssetsSpan.textContent = formatUnits(totalAssets, 18, 6);
            if (vaultSharePriceSpan) vaultSharePriceSpan.textContent = formatUnits(sharePrice, 18, 6);
            if (vaultPendingYieldSpan) vaultPendingYieldSpan.textContent = formatUnits(pendingYield, 18, 6);
            if (vaultPerformanceFeeSpan) vaultPerformanceFeeSpan.textContent = performanceFeeBps;
            if (vaultApyElem) vaultApyElem.textContent = formatPercent(aaveSupplyApy);
            if (vaultMaxAssetsElem) {
                vaultMaxAssetsElem.textContent = BigInt(maxTotalAssets) === 0n
                    ? 'No cap'
                    : formatUnits(maxTotalAssets, 18, 6) + ' WETH';
            }
            if (vaultOwnerSpan) vaultOwnerSpan.textContent = formatAddress(ownerAddress);
            if (vaultTreasurySpan) vaultTreasurySpan.textContent = formatAddress(treasuryAddress);
            if (vaultPausedStatusElem) vaultPausedStatusElem.textContent = isPaused ? 'Paused' : 'Active';

            if (vaultPerformanceFeeBpsInput && document.activeElement !== vaultPerformanceFeeBpsInput) {
                vaultPerformanceFeeBpsInput.value = performanceFeeBps;
            }
            if (vaultMaxAssetsInput && document.activeElement !== vaultMaxAssetsInput) {
                vaultMaxAssetsInput.value = BigInt(maxTotalAssets) === 0n
                    ? '0'
                    : formatUnits(maxTotalAssets, 18, 12).replace(/\.?0+$/, '');
            }
            if (vaultTreasuryInput && document.activeElement !== vaultTreasuryInput) {
                vaultTreasuryInput.value = treasuryAddress;
            }
            if (vaultOwnerActions) {
                vaultOwnerActions.hidden = !sameAddress(ownerAddress, userAccount);
            }
            if (vaultPauseButton) vaultPauseButton.disabled = isPaused;
            if (vaultUnpauseButton) vaultUnpauseButton.disabled = !isPaused;

            if (!silent) showStatus('Vault updated', 'success', 2000);
        } catch (error) {
            console.error('Vault update error:', error);
            if (!silent) showStatus(`Vault update failed: ${error.message}`, 'error');
        }
    }

    async function updateStrategyManagerPanel(options = {}) {
        const silent = options && options.silent === true;
        if (!strategyManagerPanel) return;

        if (!managerContract || !userAccount) {
            strategyManagerPanel.hidden = true;
            return;
        }

        strategyManagerPanel.hidden = false;

        try {
            const managerConfig = window.MANAGER_CONFIG || {};
            const managerAddress = managerConfig.address;
            const [
                ownerAddress,
                managerVault,
                assetAddress,
                defaultStrategy,
                idleAssets,
                totalStrategyAssets,
                totalAssets,
                strategyAddresses
            ] = await Promise.all([
                managerContract.methods.owner().call(),
                managerContract.methods.vault().call(),
                managerContract.methods.asset().call(),
                managerContract.methods.defaultStrategy().call(),
                managerContract.methods.idleAssets().call(),
                managerContract.methods.totalStrategyAssets().call(),
                managerContract.methods.totalAssets().call(),
                managerContract.methods.getStrategies().call()
            ]);

            let vaultStrategy = ZERO_ADDRESS;
            if (vaultContract && vaultContract.methods.strategy) {
                vaultStrategy = await vaultContract.methods.strategy().call();
            }

            const hasDefault = !sameAddress(defaultStrategy, ZERO_ADDRESS);
            let strategyApproved = '-';
            let strategyCap = '-';
            let strategyCapacity = '-';
            let rawStrategyCap = '0';
            const aaveSupplyApy = await fetchAaveSupplyApyPercent();

            if (hasDefault) {
                const [config, capacity] = await Promise.all([
                    managerContract.methods.strategyConfigs(defaultStrategy).call(),
                    managerContract.methods.availableStrategyCapacity(defaultStrategy).call()
                ]);

                rawStrategyCap = config.maxAssets;
                strategyApproved = config.approved ? 'Yes' : 'No';
                strategyCap = BigInt(config.maxAssets) === 0n
                    ? 'Uncapped'
                    : formatUnits(config.maxAssets, 18, 6) + ' WETH';
                strategyCapacity = BigInt(capacity) === ((1n << 256n) - 1n)
                    ? 'Uncapped'
                    : formatUnits(capacity, 18, 6) + ' WETH';
            }

            setAddressText(managerAddressSpan, managerAddress);
            setAddressText(managerOwnerSpan, ownerAddress);
            setAddressText(managerAssetSpan, assetAddress);
            setAddressText(managerDefaultStrategySpan, defaultStrategy);
            setAddressText(managerAavePoolSpan, managerConfig.network?.aavePool);
            setAddressText(managerAaveTokenSpan, managerConfig.network?.aaveAToken);
            if (managerAaveApyElem) managerAaveApyElem.textContent = formatPercent(aaveSupplyApy);

            if (managerVaultLinkStatusElem) {
                const managerMatchesVault = vaultContract && sameAddress(managerVault, window.VAULT_CONFIG?.address);
                const vaultPointsToManager = vaultContract && sameAddress(vaultStrategy, managerAddress);
                managerVaultLinkStatusElem.textContent = managerMatchesVault && vaultPointsToManager ? 'Linked' : 'Mismatch';
            }
            if (managerTotalAssetsSpan) managerTotalAssetsSpan.textContent = formatUnits(totalAssets, 18, 6);
            if (managerIdleAssetsSpan) managerIdleAssetsSpan.textContent = formatUnits(idleAssets, 18, 6);
            if (managerStrategyAssetsSpan) managerStrategyAssetsSpan.textContent = formatUnits(totalStrategyAssets, 18, 6);
            if (managerStrategyCountElem) managerStrategyCountElem.textContent = strategyAddresses.length.toString();
            if (managerStrategyApprovedElem) managerStrategyApprovedElem.textContent = strategyApproved;
            if (managerStrategyCapElem) managerStrategyCapElem.textContent = strategyCap;
            if (managerStrategyCapacityElem) managerStrategyCapacityElem.textContent = strategyCapacity;
            if (managerOwnerActions) {
                managerOwnerActions.hidden = !sameAddress(ownerAddress, userAccount);
            }
            if (managerStrategyInput && document.activeElement !== managerStrategyInput) {
                managerStrategyInput.value = hasDefault ? defaultStrategy : (managerConfig.network?.strategyAddress || '');
            }
            if (managerStrategyCapInput && document.activeElement !== managerStrategyCapInput) {
                managerStrategyCapInput.value = BigInt(rawStrategyCap) === 0n
                    ? '0'
                    : formatUnits(rawStrategyCap, 18, 12).replace(/\.?0+$/, '');
            }
            if (managerDefaultStrategyInput && document.activeElement !== managerDefaultStrategyInput) {
                managerDefaultStrategyInput.value = hasDefault ? defaultStrategy : ZERO_ADDRESS;
            }
            if (managerDivestStrategyInput && document.activeElement !== managerDivestStrategyInput) {
                managerDivestStrategyInput.value = hasDefault ? defaultStrategy : (managerConfig.network?.strategyAddress || '');
            }
            if (managerFromStrategyInput && document.activeElement !== managerFromStrategyInput) {
                managerFromStrategyInput.value = hasDefault ? defaultStrategy : (managerConfig.network?.strategyAddress || '');
            }

            if (!silent) showStatus('Strategy manager updated', 'success', 2000);
        } catch (error) {
            console.error('Strategy manager update error:', error);
            if (!silent) showStatus(`Strategy manager update failed: ${error.message}`, 'error');
        }
    }

    async function updateLendingPanel(options = {}) {
        const silent = options && options.silent === true;
        if (!lendingPanel) return;

        if (!lendingContract || !userAccount) {
            lendingPanel.hidden = true;
            return;
        }

        lendingPanel.hidden = false;

        try {
            const lendingConfig = window.LENDING_CONFIG || {};
            const lendingAddress = lendingConfig.address;
            const [
                ownerAddress,
                treasuryAddress,
                isPaused,
                borrowAprBps,
                originationFeeBps,
                maxLtvBps,
                liquidationThresholdBps,
                liquidationBonusBps,
                maxPoolLiquidity,
                totalAssets,
                availableLiquidity,
                totalBorrowDebt,
                totalCollateral,
                protocolFees,
                userShares,
                userSupplyAssets,
                loan,
                previewDebt,
                borrowCapacity,
                healthFactor,
                liquidatable
            ] = await Promise.all([
                lendingContract.methods.owner().call(),
                lendingContract.methods.treasury().call(),
                lendingContract.methods.paused().call(),
                lendingContract.methods.borrowAprBps().call(),
                lendingContract.methods.originationFeeBps().call(),
                lendingContract.methods.maxLtvBps().call(),
                lendingContract.methods.liquidationThresholdBps().call(),
                lendingContract.methods.liquidationBonusBps().call(),
                lendingContract.methods.maxPoolLiquidity().call(),
                lendingContract.methods.totalAssets().call(),
                lendingContract.methods.availableLiquidity().call(),
                lendingContract.methods.totalBorrowDebt().call(),
                lendingContract.methods.totalCollateral().call(),
                lendingContract.methods.protocolFees().call(),
                lendingContract.methods.supplyShares(userAccount).call(),
                lendingContract.methods.supplyBalanceOf(userAccount).call(),
                lendingContract.methods.loans(userAccount).call(),
                lendingContract.methods.previewDebt(userAccount).call(),
                lendingContract.methods.borrowCapacity(userAccount).call(),
                lendingContract.methods.healthFactorBps(userAccount).call(),
                lendingContract.methods.isLiquidatable(userAccount).call()
            ]);

            const loanCollateral = loan.collateral || loan[0] || "0";
            const loanDebt = loan.debt || loan[1] || "0";

            setAddressText(lendingPoolAddressSpan, lendingAddress);
            setAddressText(lendingOwnerSpan, ownerAddress);
            setAddressText(lendingTreasurySpan, treasuryAddress);
            if (lendingPausedStatusElem) lendingPausedStatusElem.textContent = isPaused ? 'Paused' : 'Active';
            if (lendingBorrowAprSpan) lendingBorrowAprSpan.textContent = borrowAprBps;
            if (lendingOriginationFeeSpan) lendingOriginationFeeSpan.textContent = originationFeeBps;
            if (lendingMaxLtvSpan) lendingMaxLtvSpan.textContent = maxLtvBps;
            if (lendingLiquidationThresholdSpan) lendingLiquidationThresholdSpan.textContent = liquidationThresholdBps;
            if (lendingLiquidationBonusSpan) lendingLiquidationBonusSpan.textContent = liquidationBonusBps;
            if (lendingMaxPoolLiquidityElem) {
                lendingMaxPoolLiquidityElem.textContent = BigInt(maxPoolLiquidity) === 0n
                    ? 'No cap'
                    : formatUnits(maxPoolLiquidity, 18, 6) + ' ETH';
            }
            if (lendingTotalAssetsSpan) lendingTotalAssetsSpan.textContent = formatUnits(totalAssets, 18, 6);
            if (lendingAvailableLiquiditySpan) lendingAvailableLiquiditySpan.textContent = formatUnits(availableLiquidity, 18, 6);
            if (lendingTotalDebtSpan) lendingTotalDebtSpan.textContent = formatUnits(totalBorrowDebt, 18, 6);
            if (lendingTotalCollateralSpan) lendingTotalCollateralSpan.textContent = formatUnits(totalCollateral, 18, 6);
            if (lendingProtocolFeesSpan) lendingProtocolFeesSpan.textContent = formatUnits(protocolFees, 18, 6);
            if (lendingUserSharesSpan) lendingUserSharesSpan.textContent = formatUnits(userShares, 18, 6);
            if (lendingUserSupplyAssetsSpan) lendingUserSupplyAssetsSpan.textContent = formatUnits(userSupplyAssets, 18, 6);
            if (lendingUserCollateralSpan) lendingUserCollateralSpan.textContent = formatUnits(loanCollateral, 18, 6);
            if (lendingUserDebtSpan) lendingUserDebtSpan.textContent = formatUnits(previewDebt || loanDebt, 18, 6);
            if (lendingBorrowCapacitySpan) lendingBorrowCapacitySpan.textContent = formatUnits(borrowCapacity, 18, 6);
            if (lendingHealthFactorElem) lendingHealthFactorElem.textContent = formatHealthFactorBps(healthFactor);
            if (lendingLiquidatableElem) lendingLiquidatableElem.textContent = liquidatable ? 'Yes' : 'No';

            if (lendingOwnerActions) {
                lendingOwnerActions.hidden = !sameAddress(ownerAddress, userAccount);
            }
            if (lendingBorrowAprInput && document.activeElement !== lendingBorrowAprInput) {
                lendingBorrowAprInput.value = borrowAprBps;
            }
            if (lendingOriginationFeeInput && document.activeElement !== lendingOriginationFeeInput) {
                lendingOriginationFeeInput.value = originationFeeBps;
            }
            if (lendingMaxLtvInput && document.activeElement !== lendingMaxLtvInput) {
                lendingMaxLtvInput.value = maxLtvBps;
            }
            if (lendingLiquidationThresholdInput && document.activeElement !== lendingLiquidationThresholdInput) {
                lendingLiquidationThresholdInput.value = liquidationThresholdBps;
            }
            if (lendingLiquidationBonusInput && document.activeElement !== lendingLiquidationBonusInput) {
                lendingLiquidationBonusInput.value = liquidationBonusBps;
            }
            if (lendingMaxLiquidityInput && document.activeElement !== lendingMaxLiquidityInput) {
                lendingMaxLiquidityInput.value = BigInt(maxPoolLiquidity) === 0n
                    ? '0'
                    : formatUnits(maxPoolLiquidity, 18, 12).replace(/\.?0+$/, '');
            }
            if (lendingTreasuryInput && document.activeElement !== lendingTreasuryInput) {
                lendingTreasuryInput.value = treasuryAddress;
            }
            if (lendingPauseButton) lendingPauseButton.disabled = isPaused;
            if (lendingUnpauseButton) lendingUnpauseButton.disabled = !isPaused;

            if (!silent) showStatus('Lending pool updated', 'success', 2000);
        } catch (error) {
            console.error('Lending pool update error:', error);
            if (!silent) showStatus(`Lending pool update failed: ${error.message}`, 'error');
        }
    }

    async function ensureSwapTokenContracts() {
        if (!swapContract) return;

        const swapConfig = window.SWAP_CONFIG || {};
        const network = swapConfig.network || {};
        const [token0Address, token1Address] = await Promise.all([
            swapContract.methods.token0().call(),
            swapContract.methods.token1().call()
        ]);

        swapToken0Contract = new web3.eth.Contract(ERC20_ABI, token0Address);
        swapToken1Contract = new web3.eth.Contract(ERC20_ABI, token1Address);

        const [
            token0Symbol,
            token1Symbol,
            token0Decimals,
            token1Decimals
        ] = await Promise.all([
            swapToken0Contract.methods.symbol().call().catch(() => network.token0Symbol || "Token0"),
            swapToken1Contract.methods.symbol().call().catch(() => network.token1Symbol || "Token1"),
            swapToken0Contract.methods.decimals().call().catch(() => network.token0Decimals || 18),
            swapToken1Contract.methods.decimals().call().catch(() => network.token1Decimals || 18)
        ]);

        swapToken0Symbol = token0Symbol || "Token0";
        swapToken1Symbol = token1Symbol || "Token1";
        swapToken0Decimals = Number(token0Decimals || 18);
        swapToken1Decimals = Number(token1Decimals || 18);

        if (swapTokenInSelect) {
            const token0Option = swapTokenInSelect.querySelector('option[value="token0"]');
            const token1Option = swapTokenInSelect.querySelector('option[value="token1"]');
            if (token0Option) token0Option.textContent = `${swapToken0Symbol} to ${swapToken1Symbol}`;
            if (token1Option) token1Option.textContent = `${swapToken1Symbol} to ${swapToken0Symbol}`;
        }
    }

    function formatSwapToken0(value) {
        return formatTokenUnits(value, swapToken0Decimals, swapToken0Symbol);
    }

    function formatSwapToken1(value) {
        return formatTokenUnits(value, swapToken1Decimals, swapToken1Symbol);
    }

    async function updateSwapPanel(options = {}) {
        const silent = options && options.silent === true;
        if (!swapPanel) return;

        if (!swapContract || !userAccount) {
            swapPanel.hidden = true;
            return;
        }

        swapPanel.hidden = false;

        try {
            await ensureSwapTokenContracts();
            const swapConfig = window.SWAP_CONFIG || {};
            const [
                ownerAddress,
                treasuryAddress,
                isPaused,
                token0Address,
                token1Address,
                swapFeeBps,
                protocolShareBps,
                reserve0,
                reserve1,
                protocolFees0,
                protocolFees1,
                totalSupply,
                userLpShares,
                userToken0Balance,
                userToken1Balance
            ] = await Promise.all([
                swapContract.methods.owner().call(),
                swapContract.methods.treasury().call(),
                swapContract.methods.paused().call(),
                swapContract.methods.token0().call(),
                swapContract.methods.token1().call(),
                swapContract.methods.swapFeeBps().call(),
                swapContract.methods.protocolFeeShareBps().call(),
                swapContract.methods.reserve0().call(),
                swapContract.methods.reserve1().call(),
                swapContract.methods.protocolFees0().call(),
                swapContract.methods.protocolFees1().call(),
                swapContract.methods.totalSupply().call(),
                swapContract.methods.balanceOf(userAccount).call(),
                swapToken0Contract.methods.balanceOf(userAccount).call(),
                swapToken1Contract.methods.balanceOf(userAccount).call()
            ]);

            setAddressText(swapPoolAddressSpan, swapConfig.address);
            setAddressText(swapOwnerSpan, ownerAddress);
            setAddressText(swapTreasurySpan, treasuryAddress);
            if (swapPausedStatusElem) swapPausedStatusElem.textContent = isPaused ? 'Paused' : 'Active';
            if (swapToken0Elem) {
                swapToken0Elem.textContent = `${swapToken0Symbol} ${formatAddress(token0Address)}`;
                swapToken0Elem.title = token0Address;
            }
            if (swapToken1Elem) {
                swapToken1Elem.textContent = `${swapToken1Symbol} ${formatAddress(token1Address)}`;
                swapToken1Elem.title = token1Address;
            }
            if (swapFeeBpsSpan) swapFeeBpsSpan.textContent = swapFeeBps;
            if (swapProtocolShareBpsSpan) swapProtocolShareBpsSpan.textContent = protocolShareBps;
            if (swapReserve0Elem) swapReserve0Elem.textContent = formatSwapToken0(reserve0);
            if (swapReserve1Elem) swapReserve1Elem.textContent = formatSwapToken1(reserve1);
            if (swapProtocolFees0Elem) swapProtocolFees0Elem.textContent = formatSwapToken0(protocolFees0);
            if (swapProtocolFees1Elem) swapProtocolFees1Elem.textContent = formatSwapToken1(protocolFees1);
            if (swapTotalLpSupplySpan) swapTotalLpSupplySpan.textContent = `${formatUnits(totalSupply, 18, 6)} sbSWAP-LP`;
            if (swapUserLpSharesSpan) swapUserLpSharesSpan.textContent = `${formatUnits(userLpShares, 18, 6)} sbSWAP-LP`;
            if (swapUserToken0BalanceElem) swapUserToken0BalanceElem.textContent = formatSwapToken0(userToken0Balance);
            if (swapUserToken1BalanceElem) swapUserToken1BalanceElem.textContent = formatSwapToken1(userToken1Balance);

            if (swapOwnerActions) {
                swapOwnerActions.hidden = !sameAddress(ownerAddress, userAccount);
            }
            if (swapFeeBpsInput && document.activeElement !== swapFeeBpsInput) {
                swapFeeBpsInput.value = swapFeeBps;
            }
            if (swapProtocolShareBpsInput && document.activeElement !== swapProtocolShareBpsInput) {
                swapProtocolShareBpsInput.value = protocolShareBps;
            }
            if (swapTreasuryInput && document.activeElement !== swapTreasuryInput) {
                swapTreasuryInput.value = treasuryAddress;
            }
            if (swapPauseButton) swapPauseButton.disabled = isPaused;
            if (swapUnpauseButton) swapUnpauseButton.disabled = !isPaused;

            await updateSwapQuote({ silent: true });
            if (!silent) showStatus('Swap pool updated', 'success', 2000);
        } catch (error) {
            console.error('Swap pool update error:', error);
            if (!silent) showStatus(`Swap pool update failed: ${error.message}`, 'error');
        }
    }

    function ensureVaultReady() {
        if (!vaultContract || !userAccount) {
            throw new Error('Connect wallet first');
        }
    }

    async function ensureVaultOwnerAction() {
        ensureVaultReady();

        if (
            !vaultContract.methods.owner ||
            !vaultContract.methods.setPerformanceFeeBps ||
            !vaultContract.methods.setMaxTotalAssets ||
            !vaultContract.methods.setTreasury ||
            !vaultContract.methods.pause ||
            !vaultContract.methods.unpause
        ) {
            throw new Error('Vault owner actions are unavailable for this vault');
        }

        const ownerAddress = await vaultContract.methods.owner().call();
        if (!sameAddress(ownerAddress, userAccount)) {
            throw new Error('Connected account is not the vault owner');
        }
    }

    function ensureManagerReady() {
        if (!managerContract || !userAccount) {
            throw new Error('Connect wallet first');
        }
    }

    async function ensureManagerOwnerAction() {
        ensureManagerReady();

        if (
            !managerContract.methods.owner ||
            !managerContract.methods.setStrategyCap ||
            !managerContract.methods.setDefaultStrategy ||
            !managerContract.methods.divestAll ||
            !managerContract.methods.rebalance
        ) {
            throw new Error('Strategy manager owner actions are unavailable');
        }

        const ownerAddress = await managerContract.methods.owner().call();
        if (!sameAddress(ownerAddress, userAccount)) {
            throw new Error('Connected account is not the strategy manager owner');
        }
    }

    async function refreshVaultAndManager() {
        await Promise.all([
            updateVaultPanel({ silent: true }),
            updateStrategyManagerPanel({ silent: true }),
            updateSuiteDashboard({ silent: true })
        ]);
    }

    function ensureLendingReady() {
        if (!lendingContract || !userAccount) {
            throw new Error('Connect wallet first');
        }
    }

    async function ensureLendingOwnerAction() {
        ensureLendingReady();

        if (
            !lendingContract.methods.owner ||
            !lendingContract.methods.setBorrowAprBps ||
            !lendingContract.methods.setOriginationFeeBps ||
            !lendingContract.methods.setRiskParameters ||
            !lendingContract.methods.setMaxPoolLiquidity ||
            !lendingContract.methods.setTreasury ||
            !lendingContract.methods.claimProtocolFees ||
            !lendingContract.methods.pause ||
            !lendingContract.methods.unpause
        ) {
            throw new Error('Lending owner actions are unavailable');
        }

        const ownerAddress = await lendingContract.methods.owner().call();
        if (!sameAddress(ownerAddress, userAccount)) {
            throw new Error('Connected account is not the lending pool owner');
        }
    }

    async function refreshLending() {
        await Promise.all([
            updateLendingPanel({ silent: true }),
            updateSuiteDashboard({ silent: true })
        ]);
    }

    function ensureSwapReady() {
        if (!swapContract || !userAccount) {
            throw new Error('Connect wallet first');
        }
    }

    async function ensureSwapOwnerAction() {
        ensureSwapReady();

        if (
            !swapContract.methods.owner ||
            !swapContract.methods.setSwapFeeBps ||
            !swapContract.methods.setProtocolFeeShareBps ||
            !swapContract.methods.setTreasury ||
            !swapContract.methods.claimProtocolFees ||
            !swapContract.methods.pause ||
            !swapContract.methods.unpause
        ) {
            throw new Error('Swap owner actions are unavailable');
        }

        const ownerAddress = await swapContract.methods.owner().call();
        if (!sameAddress(ownerAddress, userAccount)) {
            throw new Error('Connected account is not the swap pool owner');
        }
    }

    async function refreshSwap() {
        await Promise.all([
            updateSwapPanel({ silent: true }),
            updateSuiteDashboard({ silent: true })
        ]);
    }

    async function ensureSwapAllowance(tokenContract, amount, symbol) {
        const allowance = await tokenContract.methods.allowance(userAccount, window.SWAP_CONFIG.address).call();
        if (BigInt(allowance || 0) >= BigInt(amount || 0)) return;

        showStatus(`Approving ${symbol} for swap pool...`, 'info');
        await tokenContract.methods.approve(window.SWAP_CONFIG.address, amount).send({ from: userAccount });
    }

    async function addSwapLiquidity() {
        setButtonLoading(swapAddLiquidityButton, true, 'Add Liquidity');
        try {
            ensureSwapReady();
            await ensureSwapTokenContracts();
            const amount0 = parseUnits(swapAddToken0AmountInput ? swapAddToken0AmountInput.value : '', swapToken0Decimals);
            const amount1 = parseUnits(swapAddToken1AmountInput ? swapAddToken1AmountInput.value : '', swapToken1Decimals);

            await ensureSwapAllowance(swapToken0Contract, amount0, swapToken0Symbol);
            await ensureSwapAllowance(swapToken1Contract, amount1, swapToken1Symbol);

            showStatus('Adding swap liquidity...', 'info');
            const tx = await swapContract.methods.addLiquidity(amount0, amount1, 0, 0, userAccount).send({ from: userAccount });

            if (swapAddToken0AmountInput) swapAddToken0AmountInput.value = '';
            if (swapAddToken1AmountInput) swapAddToken1AmountInput.value = '';
            showStatus('Swap liquidity added', 'success');
            await refreshSwap();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Swap add liquidity error:', error);
            showStatus(`Swap liquidity failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(swapAddLiquidityButton, false);
        }
    }

    async function setSwapRemoveAll() {
        try {
            ensureSwapReady();
            const shares = await swapContract.methods.balanceOf(userAccount).call();
            if (BigInt(shares) === 0n) {
                showStatus('No swap LP shares to remove', 'info');
                if (swapRemoveLpSharesInput) swapRemoveLpSharesInput.value = '';
                return;
            }

            if (swapRemoveLpSharesInput) {
                swapRemoveLpSharesInput.value = formatUnits(shares, 18, 12);
            }
            showStatus('Swap LP remove amount set', 'success', 2000);
        } catch (error) {
            console.error('Swap remove all error:', error);
            showStatus(`Could not set swap LP amount: ${error.message}`, 'error');
        }
    }

    async function removeSwapLiquidity() {
        setButtonLoading(swapRemoveLiquidityButton, true, 'Remove');
        try {
            ensureSwapReady();
            const shares = parseUnits(swapRemoveLpSharesInput ? swapRemoveLpSharesInput.value : '', 18);

            showStatus('Removing swap liquidity...', 'info');
            const tx = await swapContract.methods.removeLiquidity(shares, 0, 0, userAccount).send({ from: userAccount });

            if (swapRemoveLpSharesInput) swapRemoveLpSharesInput.value = '';
            showStatus('Swap liquidity removed', 'success');
            await refreshSwap();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Swap remove liquidity error:', error);
            showStatus(`Swap liquidity removal failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(swapRemoveLiquidityButton, false);
        }
    }

    async function updateSwapQuote(options = {}) {
        const silent = options && options.silent === true;
        if (!swapQuoteElem || !swapContract || !swapAmountInInput) return;

        try {
            await ensureSwapTokenContracts();
            const side = swapTokenInSelect ? swapTokenInSelect.value : 'token0';
            const amountText = swapAmountInInput.value.trim();
            if (!amountText || Number(amountText) <= 0) {
                swapQuoteElem.textContent = 'Quote: -';
                return;
            }

            const tokenInAddress = side === 'token1'
                ? await swapContract.methods.token1().call()
                : await swapContract.methods.token0().call();
            const inputDecimals = side === 'token1' ? swapToken1Decimals : swapToken0Decimals;
            const outputDecimals = side === 'token1' ? swapToken0Decimals : swapToken1Decimals;
            const outputSymbol = side === 'token1' ? swapToken0Symbol : swapToken1Symbol;
            const amountIn = parseUnits(amountText, inputDecimals);
            const amountOut = await swapContract.methods.getAmountOut(tokenInAddress, amountIn).call();
            swapQuoteElem.textContent = `Quote: ${formatTokenUnits(amountOut, outputDecimals, outputSymbol)}`;
        } catch (error) {
            swapQuoteElem.textContent = 'Quote: unavailable';
            if (!silent) showStatus(`Swap quote failed: ${error.message}`, 'error');
        }
    }

    async function executeSwap() {
        setButtonLoading(swapExecuteButton, true, 'Swap');
        try {
            ensureSwapReady();
            await ensureSwapTokenContracts();
            const side = swapTokenInSelect ? swapTokenInSelect.value : 'token0';
            const inputToken = side === 'token1' ? swapToken1Contract : swapToken0Contract;
            const inputSymbol = side === 'token1' ? swapToken1Symbol : swapToken0Symbol;
            const inputDecimals = side === 'token1' ? swapToken1Decimals : swapToken0Decimals;
            const outputDecimals = side === 'token1' ? swapToken0Decimals : swapToken1Decimals;
            const tokenInAddress = side === 'token1'
                ? await swapContract.methods.token1().call()
                : await swapContract.methods.token0().call();
            const amountIn = parseUnits(swapAmountInInput ? swapAmountInInput.value : '', inputDecimals);
            const minAmountOut = swapMinAmountOutInput && swapMinAmountOutInput.value.trim()
                ? parseUnits(swapMinAmountOutInput.value, outputDecimals)
                : '0';

            await ensureSwapAllowance(inputToken, amountIn, inputSymbol);
            showStatus('Submitting swap...', 'info');
            const tx = await swapContract.methods.swapExactTokensForTokens(
                tokenInAddress,
                amountIn,
                minAmountOut,
                userAccount
            ).send({ from: userAccount });

            if (swapAmountInInput) swapAmountInInput.value = '';
            if (swapMinAmountOutInput) swapMinAmountOutInput.value = '';
            if (swapQuoteElem) swapQuoteElem.textContent = 'Quote: -';
            showStatus('Swap complete', 'success');
            await refreshSwap();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Swap execution error:', error);
            showStatus(`Swap failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(swapExecuteButton, false);
        }
    }

    async function setSwapFeeAdmin() {
        setButtonLoading(swapSetFeeButton, true, 'Set Swap Fee');
        try {
            await ensureSwapOwnerAction();
            const feeBps = parseBpsInput(swapFeeBpsInput, 'Swap fee', 100);

            showStatus('Updating swap fee...', 'info');
            const tx = await swapContract.methods.setSwapFeeBps(feeBps).send({ from: userAccount });

            showStatus('Swap fee updated', 'success');
            await refreshSwap();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Swap fee update error:', error);
            showStatus(`Swap fee update failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(swapSetFeeButton, false);
        }
    }

    async function setSwapProtocolShareAdmin() {
        setButtonLoading(swapSetProtocolShareButton, true, 'Set Protocol Share');
        try {
            await ensureSwapOwnerAction();
            const shareBps = parseBpsInput(swapProtocolShareBpsInput, 'Swap protocol share', 5000);

            showStatus('Updating swap protocol share...', 'info');
            const tx = await swapContract.methods.setProtocolFeeShareBps(shareBps).send({ from: userAccount });

            showStatus('Swap protocol share updated', 'success');
            await refreshSwap();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Swap protocol share update error:', error);
            showStatus(`Swap protocol share update failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(swapSetProtocolShareButton, false);
        }
    }

    async function setSwapTreasuryAdmin() {
        setButtonLoading(swapSetTreasuryButton, true, 'Set Treasury');
        try {
            await ensureSwapOwnerAction();
            const treasuryAddress = parseAddressInput(swapTreasuryInput, 'Swap treasury');

            showStatus('Updating swap treasury...', 'info');
            const tx = await swapContract.methods.setTreasury(treasuryAddress).send({ from: userAccount });

            showStatus('Swap treasury updated', 'success');
            await refreshSwap();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Swap treasury update error:', error);
            showStatus(`Swap treasury update failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(swapSetTreasuryButton, false);
        }
    }

    async function claimSwapFeesAdmin() {
        setButtonLoading(swapClaimFeesButton, true, 'Claim Fees');
        try {
            await ensureSwapOwnerAction();

            showStatus('Claiming swap protocol fees...', 'info');
            const tx = await swapContract.methods.claimProtocolFees().send({ from: userAccount });

            showStatus('Swap protocol fees claimed', 'success');
            await refreshSwap();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Swap fee claim error:', error);
            showStatus(`Swap fee claim failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(swapClaimFeesButton, false);
        }
    }

    async function pauseSwapAdmin() {
        setButtonLoading(swapPauseButton, true, 'Pause');
        try {
            await ensureSwapOwnerAction();

            showStatus('Pausing swap pool...', 'info');
            const tx = await swapContract.methods.pause().send({ from: userAccount });

            showStatus('Swap pool paused', 'success');
            await refreshSwap();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Swap pause error:', error);
            showStatus(`Swap pause failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(swapPauseButton, false);
            await refreshSwap();
        }
    }

    async function unpauseSwapAdmin() {
        setButtonLoading(swapUnpauseButton, true, 'Unpause');
        try {
            await ensureSwapOwnerAction();

            showStatus('Unpausing swap pool...', 'info');
            const tx = await swapContract.methods.unpause().send({ from: userAccount });

            showStatus('Swap pool unpaused', 'success');
            await refreshSwap();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Swap unpause error:', error);
            showStatus(`Swap unpause failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(swapUnpauseButton, false);
            await refreshSwap();
        }
    }

    async function depositVaultETH() {
        setButtonLoading(vaultDepositButton, true, 'Deposit');
        try {
            ensureVaultReady();
            const amountWei = parseEthInput(vaultDepositAmountInput, 'Vault deposit');

            showStatus(`Depositing ${vaultDepositAmountInput.value} ETH into vault...`, 'info');
            const tx = await vaultContract.methods.depositETH(userAccount).send({
                from: userAccount,
                value: amountWei
            });

            if (vaultDepositAmountInput) vaultDepositAmountInput.value = "";
            showStatus('Vault deposit complete', 'success');
            await refreshVaultAndManager();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Vault deposit error:', error);
            showStatus(`Vault deposit failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(vaultDepositButton, false);
        }
    }

    async function redeemVaultETH() {
        setButtonLoading(vaultRedeemButton, true, 'Redeem');
        try {
            ensureVaultReady();
            const shares = parseUnits(vaultRedeemSharesInput ? vaultRedeemSharesInput.value : "", vaultShareDecimals);
            const userShares = await vaultContract.methods.balanceOf(userAccount).call();
            if (BigInt(shares) > BigInt(userShares)) {
                throw new Error('Redeem amount exceeds your vault shares');
            }

            showStatus(`Redeeming ${vaultRedeemSharesInput.value} sbWETH...`, 'info');
            const tx = await vaultContract.methods.redeemETH(shares, userAccount, userAccount).send({
                from: userAccount
            });

            if (vaultRedeemSharesInput) vaultRedeemSharesInput.value = "";
            showStatus('Vault redeem complete', 'success');
            await refreshVaultAndManager();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Vault redeem error:', error);
            showStatus(`Vault redeem failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(vaultRedeemButton, false);
        }
    }

    async function setVaultRedeemAll() {
        try {
            ensureVaultReady();
            const userShares = await vaultContract.methods.balanceOf(userAccount).call();
            if (BigInt(userShares) === 0n) {
                showStatus('No vault shares to redeem', 'info');
                if (vaultRedeemSharesInput) vaultRedeemSharesInput.value = "";
                return;
            }

            if (vaultRedeemSharesInput) {
                vaultRedeemSharesInput.value = formatUnits(userShares, vaultShareDecimals, 12);
            }
            showStatus('Vault redeem amount set', 'success', 2000);
        } catch (error) {
            console.error('Vault redeem all error:', error);
            showStatus(`Could not set vault redeem amount: ${error.message}`, 'error');
        }
    }

    async function harvestVaultPerformanceFee() {
        setButtonLoading(vaultHarvestButton, true, 'Harvest');
        try {
            ensureVaultReady();
            showStatus('Harvesting vault performance fee...', 'info');
            const tx = await vaultContract.methods.harvestPerformanceFee().send({ from: userAccount });

            showStatus('Vault harvest complete', 'success');
            await refreshVaultAndManager();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Vault harvest error:', error);
            showStatus(`Vault harvest failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(vaultHarvestButton, false);
        }
    }

    async function setVaultPerformanceFeeAdmin() {
        setButtonLoading(vaultSetPerformanceFeeButton, true, 'Set Fee');
        try {
            await ensureVaultOwnerAction();
            const feeBps = await parseVaultPerformanceFeeBpsInput();

            showStatus(`Setting vault performance fee to ${feeBps} bps...`, 'info');
            const tx = await vaultContract.methods.setPerformanceFeeBps(feeBps).send({ from: userAccount });

            showStatus('Vault performance fee updated', 'success');
            await refreshVaultAndManager();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Vault performance fee update error:', error);
            showStatus(`Vault performance fee update failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(vaultSetPerformanceFeeButton, false);
        }
    }

    async function setVaultMaxAssetsAdmin() {
        setButtonLoading(vaultSetMaxAssetsButton, true, 'Set Cap');
        try {
            await ensureVaultOwnerAction();
            const maxTotalAssets = parseNonNegativeEthInput(vaultMaxAssetsInput, 'Vault cap');

            showStatus(`Setting vault cap to ${vaultMaxAssetsInput.value} WETH...`, 'info');
            const tx = await vaultContract.methods.setMaxTotalAssets(maxTotalAssets).send({ from: userAccount });

            showStatus('Vault cap updated', 'success');
            await refreshVaultAndManager();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Vault cap update error:', error);
            showStatus(`Vault cap update failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(vaultSetMaxAssetsButton, false);
        }
    }

    async function setVaultTreasuryAdmin() {
        setButtonLoading(vaultSetTreasuryButton, true, 'Set Treasury');
        try {
            await ensureVaultOwnerAction();
            const treasuryAddress = parseAddressInput(vaultTreasuryInput, 'Vault treasury');

            showStatus('Updating vault treasury...', 'info');
            const tx = await vaultContract.methods.setTreasury(treasuryAddress).send({ from: userAccount });

            showStatus('Vault treasury updated', 'success');
            await refreshVaultAndManager();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Vault treasury update error:', error);
            showStatus(`Vault treasury update failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(vaultSetTreasuryButton, false);
        }
    }

    async function pauseVaultAdmin() {
        setButtonLoading(vaultPauseButton, true, 'Pause');
        try {
            await ensureVaultOwnerAction();

            showStatus('Pausing vault...', 'info');
            const tx = await vaultContract.methods.pause().send({ from: userAccount });

            showStatus('Vault paused', 'success');
            await refreshVaultAndManager();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Vault pause error:', error);
            showStatus(`Vault pause failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(vaultPauseButton, false);
            await refreshVaultAndManager();
        }
    }

    async function unpauseVaultAdmin() {
        setButtonLoading(vaultUnpauseButton, true, 'Unpause');
        try {
            await ensureVaultOwnerAction();

            showStatus('Unpausing vault...', 'info');
            const tx = await vaultContract.methods.unpause().send({ from: userAccount });

            showStatus('Vault unpaused', 'success');
            await refreshVaultAndManager();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Vault unpause error:', error);
            showStatus(`Vault unpause failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(vaultUnpauseButton, false);
            await refreshVaultAndManager();
        }
    }

    async function setManagerStrategyCapAdmin() {
        setButtonLoading(managerSetStrategyCapButton, true, 'Set Cap');
        try {
            await ensureManagerOwnerAction();
            const strategyAddress = parseAddressInput(managerStrategyInput, 'Strategy');
            const maxAssets = parseNonNegativeEthInput(managerStrategyCapInput, 'Strategy cap');

            showStatus('Updating strategy cap...', 'info');
            const tx = await managerContract.methods.setStrategyCap(strategyAddress, maxAssets).send({ from: userAccount });

            showStatus('Strategy cap updated', 'success');
            await refreshVaultAndManager();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Strategy cap update error:', error);
            showStatus(`Strategy cap update failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(managerSetStrategyCapButton, false);
        }
    }

    async function setManagerDefaultStrategyAdmin() {
        setButtonLoading(managerSetDefaultStrategyButton, true, 'Set Default');
        try {
            await ensureManagerOwnerAction();
            const strategyAddress = parseOptionalStrategyAddressInput(managerDefaultStrategyInput, 'Default strategy');

            showStatus('Updating default strategy...', 'info');
            const tx = await managerContract.methods.setDefaultStrategy(strategyAddress).send({ from: userAccount });

            showStatus('Default strategy updated', 'success');
            await refreshVaultAndManager();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Default strategy update error:', error);
            showStatus(`Default strategy update failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(managerSetDefaultStrategyButton, false);
        }
    }

    async function divestManagerStrategyAdmin() {
        setButtonLoading(managerDivestAllButton, true, 'Divest');
        try {
            await ensureManagerOwnerAction();
            const strategyAddress = parseAddressInput(managerDivestStrategyInput, 'Strategy');

            showStatus('Divesting manager strategy...', 'info');
            const tx = await managerContract.methods.divestAll(strategyAddress).send({ from: userAccount });

            showStatus('Manager strategy divested', 'success');
            await refreshVaultAndManager();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Manager divest error:', error);
            showStatus(`Manager divest failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(managerDivestAllButton, false);
        }
    }

    async function rebalanceManagerStrategyAdmin() {
        setButtonLoading(managerRebalanceButton, true, 'Rebalance');
        try {
            await ensureManagerOwnerAction();
            const fromStrategy = parseAddressInput(managerFromStrategyInput, 'From strategy');
            const toStrategy = parseAddressInput(managerToStrategyInput, 'To strategy');
            const assets = parseEthInput(managerRebalanceAmountInput, 'Rebalance amount');

            showStatus('Rebalancing manager strategies...', 'info');
            const tx = await managerContract.methods.rebalance(fromStrategy, toStrategy, assets).send({ from: userAccount });

            showStatus('Manager rebalance complete', 'success');
            await refreshVaultAndManager();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Manager rebalance error:', error);
            showStatus(`Manager rebalance failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(managerRebalanceButton, false);
        }
    }

    async function supplyLendingETH() {
        setButtonLoading(lendingSupplyButton, true, 'Supply');
        try {
            ensureLendingReady();
            const amountWei = parseEthInput(lendingSupplyAmountInput, 'Supply amount');

            showStatus(`Supplying ${lendingSupplyAmountInput.value} ETH to lending pool...`, 'info');
            const tx = await lendingContract.methods.supply().send({
                from: userAccount,
                value: amountWei
            });

            if (lendingSupplyAmountInput) lendingSupplyAmountInput.value = '';
            showStatus('Lending supply complete', 'success');
            await refreshLending();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Lending supply error:', error);
            showStatus(`Lending supply failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(lendingSupplyButton, false);
        }
    }

    async function setLendingWithdrawAll() {
        try {
            ensureLendingReady();
            const shares = await lendingContract.methods.supplyShares(userAccount).call();
            if (BigInt(shares) === 0n) {
                showStatus('No lending supply shares to withdraw', 'info');
                if (lendingWithdrawSharesInput) lendingWithdrawSharesInput.value = '';
                return;
            }

            if (lendingWithdrawSharesInput) {
                lendingWithdrawSharesInput.value = formatUnits(shares, 18, 12);
            }
            showStatus('Lending withdraw amount set', 'success', 2000);
        } catch (error) {
            console.error('Lending withdraw all error:', error);
            showStatus(`Could not set lending withdraw amount: ${error.message}`, 'error');
        }
    }

    async function withdrawLendingSupply() {
        setButtonLoading(lendingWithdrawSupplyButton, true, 'Withdraw');
        try {
            ensureLendingReady();
            const shares = parseUnits(lendingWithdrawSharesInput ? lendingWithdrawSharesInput.value : '', 18);

            showStatus(`Withdrawing ${lendingWithdrawSharesInput.value} lpETH shares...`, 'info');
            const tx = await lendingContract.methods.withdrawSupply(shares).send({ from: userAccount });

            if (lendingWithdrawSharesInput) lendingWithdrawSharesInput.value = '';
            showStatus('Lending supply withdrawal complete', 'success');
            await refreshLending();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Lending supply withdrawal error:', error);
            showStatus(`Lending supply withdrawal failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(lendingWithdrawSupplyButton, false);
        }
    }

    async function depositLendingCollateral() {
        setButtonLoading(lendingDepositCollateralButton, true, 'Deposit Collateral');
        try {
            ensureLendingReady();
            const amountWei = parseEthInput(lendingCollateralAmountInput, 'Collateral amount');

            showStatus(`Depositing ${lendingCollateralAmountInput.value} ETH collateral...`, 'info');
            const tx = await lendingContract.methods.depositCollateral().send({
                from: userAccount,
                value: amountWei
            });

            showStatus('Collateral deposit complete', 'success');
            await refreshLending();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Lending collateral deposit error:', error);
            showStatus(`Collateral deposit failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(lendingDepositCollateralButton, false);
        }
    }

    async function borrowLending() {
        setButtonLoading(lendingBorrowButton, true, 'Borrow');
        try {
            ensureLendingReady();
            const borrowAmount = parseEthInput(lendingBorrowAmountInput, 'Borrow amount');

            showStatus(`Borrowing ${lendingBorrowAmountInput.value} ETH...`, 'info');
            const tx = await lendingContract.methods.borrow(borrowAmount).send({ from: userAccount });

            showStatus('Lending borrow complete', 'success');
            await refreshLending();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Lending borrow error:', error);
            showStatus(`Lending borrow failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(lendingBorrowButton, false);
        }
    }

    async function borrowWithLendingCollateral() {
        setButtonLoading(lendingBorrowWithCollateralButton, true, 'Deposit + Borrow');
        try {
            ensureLendingReady();
            const collateralAmount = parseEthInput(lendingCollateralAmountInput, 'Collateral amount');
            const borrowAmount = parseEthInput(lendingBorrowAmountInput, 'Borrow amount');

            showStatus('Opening lending loan...', 'info');
            const tx = await lendingContract.methods.borrowWithCollateral(borrowAmount).send({
                from: userAccount,
                value: collateralAmount
            });

            showStatus('Lending loan opened', 'success');
            await refreshLending();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Lending borrow with collateral error:', error);
            showStatus(`Lending loan open failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(lendingBorrowWithCollateralButton, false);
        }
    }

    async function repayLending() {
        setButtonLoading(lendingRepayButton, true, 'Repay');
        try {
            ensureLendingReady();
            const repayAmount = parseEthInput(lendingRepayAmountInput, 'Repay amount');

            showStatus(`Repaying ${lendingRepayAmountInput.value} ETH...`, 'info');
            const tx = await lendingContract.methods.repay().send({
                from: userAccount,
                value: repayAmount
            });

            showStatus('Lending repay complete', 'success');
            await refreshLending();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Lending repay error:', error);
            showStatus(`Lending repay failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(lendingRepayButton, false);
        }
    }

    async function repayAllLending() {
        setButtonLoading(lendingRepayAllButton, true, 'Repay All');
        try {
            ensureLendingReady();
            const debt = await lendingContract.methods.previewDebt(userAccount).call();
            if (BigInt(debt) === 0n) {
                showStatus('No lending debt to repay', 'info');
                return;
            }

            const repayAmount = (BigInt(debt) + BigInt(web3.utils.toWei('0.000001', 'ether'))).toString();
            showStatus(`Repaying up to ${formatUnits(repayAmount, 18, 12)} ETH...`, 'info');
            const tx = await lendingContract.methods.repay().send({
                from: userAccount,
                value: repayAmount
            });

            showStatus('Lending repay all complete', 'success');
            await refreshLending();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Lending repay all error:', error);
            showStatus(`Lending repay all failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(lendingRepayAllButton, false);
        }
    }

    async function withdrawLendingCollateral() {
        setButtonLoading(lendingWithdrawCollateralButton, true, 'Withdraw Collateral');
        try {
            ensureLendingReady();
            const amountWei = parseEthInput(lendingWithdrawCollateralAmountInput, 'Collateral withdrawal');

            showStatus(`Withdrawing ${lendingWithdrawCollateralAmountInput.value} ETH collateral...`, 'info');
            const tx = await lendingContract.methods.withdrawCollateral(amountWei).send({ from: userAccount });

            showStatus('Collateral withdrawal complete', 'success');
            await refreshLending();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Lending collateral withdrawal error:', error);
            showStatus(`Collateral withdrawal failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(lendingWithdrawCollateralButton, false);
        }
    }

    async function liquidateLending() {
        setButtonLoading(lendingLiquidateButton, true, 'Liquidate');
        try {
            ensureLendingReady();
            const borrowerAddress = parseAddressInput(lendingLiquidateBorrowerInput, 'Liquidation borrower');
            const repayAmount = parseEthInput(lendingLiquidateRepayAmountInput, 'Liquidation repay amount');

            showStatus('Submitting lending liquidation...', 'info');
            const tx = await lendingContract.methods.liquidate(borrowerAddress).send({
                from: userAccount,
                value: repayAmount
            });

            showStatus('Lending liquidation complete', 'success');
            await refreshLending();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Lending liquidation error:', error);
            showStatus(`Lending liquidation failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(lendingLiquidateButton, false);
        }
    }

    async function setLendingRatesAdmin() {
        setButtonLoading(lendingSetRatesButton, true, 'Set Rates');
        try {
            await ensureLendingOwnerAction();
            const borrowAprBps = parseBpsInput(lendingBorrowAprInput, 'Borrow APR', 5000);
            const originationFeeBps = parseBpsInput(lendingOriginationFeeInput, 'Origination fee', 100);

            showStatus('Updating lending rates...', 'info');
            const aprTx = await lendingContract.methods.setBorrowAprBps(borrowAprBps).send({ from: userAccount });
            const feeTx = await lendingContract.methods.setOriginationFeeBps(originationFeeBps).send({ from: userAccount });

            showStatus('Lending rates updated', 'success');
            await refreshLending();
            showTransactionLink(feeTx.transactionHash || aprTx.transactionHash);
        } catch (error) {
            console.error('Lending rate update error:', error);
            showStatus(`Lending rate update failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(lendingSetRatesButton, false);
        }
    }

    async function setLendingRiskAdmin() {
        setButtonLoading(lendingSetRiskButton, true, 'Set Risk');
        try {
            await ensureLendingOwnerAction();
            const maxLtvBps = parseBpsInput(lendingMaxLtvInput, 'Max LTV', 8000);
            const thresholdBps = parseBpsInput(lendingLiquidationThresholdInput, 'Liquidation threshold', 9000);
            const bonusBps = parseBpsInput(lendingLiquidationBonusInput, 'Liquidation bonus', 2000);

            showStatus('Updating lending risk parameters...', 'info');
            const tx = await lendingContract.methods
                .setRiskParameters(maxLtvBps, thresholdBps, bonusBps)
                .send({ from: userAccount });

            showStatus('Lending risk updated', 'success');
            await refreshLending();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Lending risk update error:', error);
            showStatus(`Lending risk update failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(lendingSetRiskButton, false);
        }
    }

    async function setLendingMaxLiquidityAdmin() {
        setButtonLoading(lendingSetMaxLiquidityButton, true, 'Set Cap');
        try {
            await ensureLendingOwnerAction();
            const maxLiquidity = parseNonNegativeEthInput(lendingMaxLiquidityInput, 'Lending pool cap');

            showStatus('Updating lending pool cap...', 'info');
            const tx = await lendingContract.methods.setMaxPoolLiquidity(maxLiquidity).send({ from: userAccount });

            showStatus('Lending pool cap updated', 'success');
            await refreshLending();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Lending cap update error:', error);
            showStatus(`Lending cap update failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(lendingSetMaxLiquidityButton, false);
        }
    }

    async function setLendingTreasuryAdmin() {
        setButtonLoading(lendingSetTreasuryButton, true, 'Set Treasury');
        try {
            await ensureLendingOwnerAction();
            const treasuryAddress = parseAddressInput(lendingTreasuryInput, 'Lending treasury');

            showStatus('Updating lending treasury...', 'info');
            const tx = await lendingContract.methods.setTreasury(treasuryAddress).send({ from: userAccount });

            showStatus('Lending treasury updated', 'success');
            await refreshLending();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Lending treasury update error:', error);
            showStatus(`Lending treasury update failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(lendingSetTreasuryButton, false);
        }
    }

    async function claimLendingFeesAdmin() {
        setButtonLoading(lendingClaimFeesButton, true, 'Claim Fees');
        try {
            await ensureLendingOwnerAction();

            showStatus('Claiming lending protocol fees...', 'info');
            const tx = await lendingContract.methods.claimProtocolFees().send({ from: userAccount });

            showStatus('Lending protocol fees claimed', 'success');
            await refreshLending();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Lending fee claim error:', error);
            showStatus(`Lending fee claim failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(lendingClaimFeesButton, false);
        }
    }

    async function pauseLendingAdmin() {
        setButtonLoading(lendingPauseButton, true, 'Pause');
        try {
            await ensureLendingOwnerAction();

            showStatus('Pausing lending pool...', 'info');
            const tx = await lendingContract.methods.pause().send({ from: userAccount });

            showStatus('Lending pool paused', 'success');
            await refreshLending();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Lending pause error:', error);
            showStatus(`Lending pause failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(lendingPauseButton, false);
            await refreshLending();
        }
    }

    async function unpauseLendingAdmin() {
        setButtonLoading(lendingUnpauseButton, true, 'Unpause');
        try {
            await ensureLendingOwnerAction();

            showStatus('Unpausing lending pool...', 'info');
            const tx = await lendingContract.methods.unpause().send({ from: userAccount });

            showStatus('Lending pool unpaused', 'success');
            await refreshLending();
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Lending unpause error:', error);
            showStatus(`Lending unpause failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(lendingUnpauseButton, false);
            await refreshLending();
        }
    }

    // ==========================
    // DEPOSIT
    // ==========================
    async function deposit() {
        if (!depositAmountInput) return;
        const amount = depositAmountInput.value;

        if (!amount || amount <= 0) {
            showStatus('Please enter a valid amount.', 'error');
            return;
        }

        if (!bankContract || !userAccount) {
            showStatus('Please connect your wallet first', 'error');
            return;
        }

        setButtonLoading(depositButton, true, 'Deposit');

        try {
            const isPaused = await bankContract.methods.paused().call();
            if (isPaused) {
                showStatus('Contract is paused. Deposits are temporarily disabled.', 'info', 0);
                return;
            }

            const amountWei = web3.utils.toWei(amount, 'ether');
            showStatus(`Processing deposit of ${amount} ETH...`, 'info');

            const minWei = await bankContract.methods.minDeposit().call();
            if (BigInt(minWei) > 0n && BigInt(amountWei) < BigInt(minWei)) {
                const minEth = web3.utils.fromWei(minWei, 'ether');
                showStatus(`Minimum deposit is ${minEth} ETH`, 'error');
                return;
            }

            const tx = await bankContract.methods.deposit().send({
                from: userAccount,
                value: amountWei
            });

            showStatus(`Sucessfully deposited ${amount} ETH!`, 'success');
            depositAmountInput.value = "";

            await Promise.all([
                 updateBalances(),
                 updateSuiteDashboard({ silent: true }),
                 loadTransactionHistory({ silent: true })
            ]);
            
            showTransactionLink(tx.transactionHash);

        } catch (error) {
            console.error( 'Deposit error:', error);
            showStatus(`Deposit failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(depositButton, false);
        }
    }

    // ==========================
    // WITHDRAW
    // ==========================
    async function withdraw() {
       if (!withdrawAmountInput) return; 
       const amount = withdrawAmountInput.value;

        if (!amount || amount <= 0) {
            showStatus('Please enter a valid amount.', 'error');
            return;
        }

        if (!bankContract || !userAccount) {
        showStatus('Please connect your wallet first', 'error');
        return;
        }

         setButtonLoading(withdrawButton, true, 'Withdraw');
        try {
            const amountWei = web3.utils.toWei(amount, 'ether');

            const [userBalanceWei, lastDepositTime, withdrawalLockDays, latestBlock] = await Promise.all([
                bankContract.methods.getBalance().call({ from: userAccount }),
                bankContract.methods.getLastDepositTime(userAccount).call(),
                bankContract.methods.withdrawalLockDays().call(),
                web3.eth.getBlock('latest')
            ]);

            if (BigInt(userBalanceWei) < BigInt(amountWei)) {
                showStatus('Withdrawal amount exceeds your SimpleBank balance.', 'error');
                return;
            }

            const unlockTime = BigInt(lastDepositTime) + (BigInt(withdrawalLockDays) * 86400n);
            const currentTime = BigInt(latestBlock.timestamp);
            if (currentTime < unlockTime) {
                const unlockDate = new Date(Number(unlockTime) * 1000).toLocaleString();
                showStatus(`Withdrawal locked until ${unlockDate}.`, 'info', 0);
                return;
            }

            showStatus(`Processing withdrawal of ${amount} ETH...`, 'info');

           const tx = await bankContract.methods.withdraw(amountWei).send({
                from: userAccount
            });

            showStatus(`Sucessfully withdrew ${amount} ETH`, 'success');
            withdrawAmountInput.value = "";
            

            await Promise.all([
                updateBalances(),
                updateSuiteDashboard({ silent: true }),
                loadTransactionHistory({ silent: true })
            ]);

            showTransactionLink(tx.transactionHash);

        } catch (error) {
            console.error('Withdraw error', error);
            showStatus(`Withdrawal failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(withdrawButton, false);
        }
    }

    // ==========================
    // CLAIM INTEREST
    // ==========================
    async function claimInterest() {
       if (!bankContract || !userAccount) {
       showStatus('Please connect your wallet first', 'error');
       return;
}    

       setButtonLoading(claimInterestButton, true, 'Claim Interest');
    try {
            const isPaused = await bankContract.methods.paused().call();
            if (isPaused) {
                showStatus('Contract is paused. Interest claims are temporarily disabled.', 'info', 0);
                return;
            }

            const pendingWei = await bankContract.methods.getPendingInterest(userAccount).call({ from: userAccount });
            const claimableWei = bankContract.methods.getClaimableInterest
                ? await bankContract.methods.getClaimableInterest(userAccount).call({ from: userAccount })
                : pendingWei;

            if (BigInt(pendingWei) === 0n) {
                showStatus('No interest claimable yet. Interest accrues after 1 full day.', 'info', 0);
                return;
            }

            if (BigInt(claimableWei) === 0n) {
                showStatus('Interest exists, but the reserve is not funded enough to claim it yet.', 'error');
                return;
            }

            showStatus('Claiming interest...', 'info');

            const tx = await bankContract.methods.claimInterest().send({
                from: userAccount
            });

            showStatus('Interest claimed successfully!', 'success');
            
            await Promise.all([
                updateBalances(),
                updateSuiteDashboard({ silent: true }),
                loadTransactionHistory({ silent: true })
            ]);

         showTransactionLink(tx.transactionHash);

        } catch (error) {
            console.error('Claim interest error', error);
            if (error.message.includes('No interest available yet')) {
            showStatus('No interest available yet. Interest accrues daily', 'info', 0);
            } else {
            showStatus(`Failed to claim interest: ${error.message}`, 'error');
        } 
     }finally {
            setButtonLoading(claimInterestButton, false);
        }
    }

    async function ensureOwnerAction() {
        if (!bankContract || !userAccount) {
            throw new Error('Connect wallet first');
        }

        if (!hasV3AdminMethods()) {
            throw new Error('Owner actions require SimpleBank V3');
        }

        const ownerAddress = await bankContract.methods.owner().call();
        if (!sameAddress(ownerAddress, userAccount)) {
            throw new Error('Connected account is not the contract owner');
        }
    }

    async function fundInterestReserveAdmin() {
        setButtonLoading(fundReserveButton, true, 'Fund');
        try {
            await ensureOwnerAction();
            const amountWei = parseEthInput(reserveAmountInput, 'Reserve amount');

            showStatus(`Funding reserve with ${reserveAmountInput.value} ETH...`, 'info');
            const tx = await bankContract.methods.fundInterestReserve().send({
                from: userAccount,
                value: amountWei
            });

            if (reserveAmountInput) reserveAmountInput.value = "";
            showStatus('Interest reserve funded', 'success');
            await Promise.all([
                updateBalances({ silent: true }),
                updateAdminPanel({ silent: true }),
                updateSuiteDashboard({ silent: true })
            ]);
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Fund reserve error:', error);
            showStatus(`Reserve funding failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(fundReserveButton, false);
        }
    }

    async function setDepositFeeAdmin() {
        setButtonLoading(setDepositFeeButton, true, 'Set Deposit');
        try {
            await ensureOwnerAction();
            const feeBps = await parseFeeBpsInput(depositFeeBpsInput, 'Deposit fee');

            showStatus(`Setting deposit fee to ${feeBps} bps...`, 'info');
            const tx = await bankContract.methods.setDepositFeeBps(feeBps).send({ from: userAccount });

            showStatus('Deposit fee updated', 'success');
            await Promise.all([
                updateAdminPanel({ silent: true }),
                updateSuiteDashboard({ silent: true })
            ]);
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Set deposit fee error:', error);
            showStatus(`Deposit fee update failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(setDepositFeeButton, false);
        }
    }

    async function setWithdrawalFeeAdmin() {
        setButtonLoading(setWithdrawalFeeButton, true, 'Set Withdraw');
        try {
            await ensureOwnerAction();
            const feeBps = await parseFeeBpsInput(withdrawalFeeBpsInput, 'Withdrawal fee');

            showStatus(`Setting withdrawal fee to ${feeBps} bps...`, 'info');
            const tx = await bankContract.methods.setWithdrawalFeeBps(feeBps).send({ from: userAccount });

            showStatus('Withdrawal fee updated', 'success');
            await Promise.all([
                updateAdminPanel({ silent: true }),
                updateSuiteDashboard({ silent: true })
            ]);
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Set withdrawal fee error:', error);
            showStatus(`Withdrawal fee update failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(setWithdrawalFeeButton, false);
        }
    }

    async function setWithdrawalLockAdmin() {
        setButtonLoading(setWithdrawalLockButton, true, 'Set Lock');
        try {
            await ensureOwnerAction();
            const daysLock = await parseWithdrawalLockDaysInput();

            showStatus(`Setting withdrawal lock to ${daysLock} days...`, 'info');
            const tx = await bankContract.methods.setWithdrawalLockDays(daysLock).send({ from: userAccount });

            showStatus('Withdrawal lock updated', 'success');
            await Promise.all([
                updateAdminPanel({ silent: true }),
                updateSuiteDashboard({ silent: true })
            ]);
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Set withdrawal lock error:', error);
            showStatus(`Withdrawal lock update failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(setWithdrawalLockButton, false);
        }
    }

    async function claimProtocolFeesAdmin() {
        setButtonLoading(claimProtocolFeesButton, true, 'Claim Fees');
        try {
            await ensureOwnerAction();

            const protocolFeesWei = await bankContract.methods.protocolFees().call();
            if (BigInt(protocolFeesWei) === 0n) {
                showStatus('No protocol fees to claim', 'info', 0);
                return;
            }

            showStatus('Claiming protocol fees...', 'info');
            const tx = await bankContract.methods.claimProtocolFees().send({ from: userAccount });

            showStatus('Protocol fees claimed', 'success');
            await Promise.all([
                updateBalances({ silent: true }),
                updateAdminPanel({ silent: true }),
                updateSuiteDashboard({ silent: true })
            ]);
            showTransactionLink(tx.transactionHash);
        } catch (error) {
            console.error('Claim protocol fees error:', error);
            showStatus(`Protocol fee claim failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(claimProtocolFeesButton, false);
        }
    }

    // ==========================
    // TRANSACTION HISTORY
    // ==========================
    async function loadTransactionHistory(options = {}) {
        const silent = options && options.silent === true;
        if (!bankContract || !userAccount) {
        if (transactionList) transactionList.innerHTML = '<div class="loading-spinner">Connect wallet to see transactions</div>';
        return;
        }

        if (!silent) {
            setButtonLoading(refreshHistoryButton, true, 'Refresh');
            if (transactionList) transactionList.innerHTML = '<div class="loading-spinner">Loading transactions...</div>';
        }

        try {

            const [depositEvents, withdrawEvents] = await Promise.all([
            getPastEventsWithFallback('Deposit', {
                filter: { user: userAccount },
            }),
            getPastEventsWithFallback('WithdrawalMade', {
                filter: { user: userAccount },
            })
        ]);

         let allEvents = [...depositEvents, ...withdrawEvents];
         allEvents.sort((a, b) => b.blockNumber - a.blockNumber);

         const recentEvents = allEvents.slice(0, 10);

         if (txCountSpan) {
          txCountSpan.textContent = `${allEvents.length} total transaction`;
         }

         if (recentEvents.length === 0) {
         if (transactionList) transactionList.innerHTML = '<div class="loading-spinner">No transaction yet. Make a deposit!</div>';
         return;
         }

         let html = "";
         recentEvents.forEach(event => {
            const isDeposit = event.event ==='Deposit';
            const type = isDeposit ? 'Deposit' : 'Withdraw';
            const amountWei = event.returnValues.amount;
            const amountEth = web3.utils.fromWei(amountWei, 'ether');
            const blockNumber = event.blockNumber;
            const txHash = event.transactionHash;

            html += `
            <div class="transaction-item ${isDeposit ? 'deposit' : 'withdraw'}">
                <div class="transaction-item ${isDeposit ? 'deposit' : 'withdraw'}">
                    ${type}
                </div>
                <div class="transaction-amount">
                    ${parseFloat(amountEth).toFixed(6)} ETH
                </div>
                <div class="transaction-time">
                    Block: ${blockNumber}
                </div>
                <a href="${getExplorerTxUrl(txHash)}" target="_blank" class="transaction-hash">
                View
                </a>
            </div>
            `;
            });

            if (transactionList) transactionList.innerHTML = html;
            if (!silent) showStatus('Transaction history updated', 'success', 2000);

         } catch (error) {
            console.error('Error loading transaction history', error);
            if (!silent) {
                if (transactionList) {
                    transactionList.innerHTML = '<div class="loading-spinner">Transaction history unavailable from this RPC. Balances still work.</div>';
                }
                showStatus('Transaction history unavailable from this RPC. Balances still work.', 'info', 0);
            }
            } finally {
            if (!silent) setButtonLoading(refreshHistoryButton, false);
        }
    }

    // ==========================
    // ACCOUNT CHANGE HANDLER
    // ==========================
    function handleAccountsChanged(accounts) {
        if (accounts.length === 0) {
            stopAutoRefresh();
            showStatus('Wallet disconnected.', 'info');
            userAccount = null;
            if (connectButton) {
            connectButton.innerHTML = 'Connect MetaMask';
            connectButton.disabled = false;
            }
            if (connectedAccountSpan) connectedAccountSpan.textContent = 'Not Connected';
            if (userBalanceSpan) userBalanceSpan.textContent = '0';
            if (contractBalanceSpan) contractBalanceSpan.textContent = '0';
            if (pendingInterestSpan) pendingInterestSpan.textContent = '0';
            if (transactionList) transactionList.innerHTML = '<div class="loading-spinner">Connect wallet to see transactions</div>';
            if (suiteDashboard) suiteDashboard.hidden = true;
            if (adminPanel) adminPanel.hidden = true;
            if (vaultPanel) vaultPanel.hidden = true;
            if (vaultOwnerActions) vaultOwnerActions.hidden = true;
            if (strategyManagerPanel) strategyManagerPanel.hidden = true;
            if (lendingPanel) lendingPanel.hidden = true;
            if (lendingOwnerActions) lendingOwnerActions.hidden = true;
            if (swapPanel) swapPanel.hidden = true;
            if (swapOwnerActions) swapOwnerActions.hidden = true;

        } else if (accounts[0] !== userAccount) {
            userAccount = accounts[0];
            if (connectedAccountSpan) connectedAccountSpan.textContent = formatAddress(userAccount);
            showStatus('Account switched', 'info');
            Promise.all([
                updateBalances(),
                updateSuiteDashboard({ silent: true }),
                updateVaultPanel({ silent: true }),
                updateStrategyManagerPanel({ silent: true }),
                updateLendingPanel({ silent: true }),
                updateSwapPanel({ silent: true }),
                loadTransactionHistory({ silent: true }),
                updateAdminPanel({ silent: true })
            ]);
        }

    }

    // ==================
    //  ETH Balance
    // ==================
    async function getUserEthBalance() {
        if (!userAccount) return 0;
        const balanceWei = await web3.eth.getBalance(userAccount);
        return web3.utils.fromWei(balanceWei, 'ether');
    }

    // ===================
    // MAX DEPOSIT
    // ===================
    async function setMaxDeposit() {
        if (!userAccount) {
            showStatus("Connect wallet first", 'error');
            return;
        }
        if (!bankContract) {
            showStatus("Contract not initialized", 'error');
            return;
        }
        try {
            const userBalanceWei = await web3.eth.getBalance(userAccount);
            const userBalanceWeiBig = BigInt(userBalanceWei);

            const gasEstimate = await bankContract.methods.deposit().estimateGas({ from: userAccount, value: '1'});
            const gasPrice = BigInt(await web3.eth.getGasPrice());
            const gasCostWei = BigInt(gasEstimate) * gasPrice;
             
            const gasBuffer = (gasCostWei * 10n) / 100n;
            const totalGasWei = gasCostWei + gasBuffer;

            if (userBalanceWeiBig <= totalGasWei) {
                showStatus("Not enough ETH to cover gas.Please add more ETH", 'error');
                depositAmountInput.value = '0';
                return;
            }
            const maxDepositWei = userBalanceWeiBig - totalGasWei;
            
            const maxDepositEth = web3.utils.fromWei(maxDepositWei.toString(), 'ether');
            let finalDepositEth = parseFloat(maxDepositEth);
                        
            if (bankContract.methods.maxDeposit) {
                try {
                const contractMaxWei = await bankContract.methods.maxDeposit().call();
                const contractMaxEth = parseFloat(web3.utils.fromWei(contractMaxWei, 'ether'));
                if (contractMaxEth > 0 && contractMaxEth < finalDepositEth) {
                    finalDepositEth = contractMaxEth;
                    showStatus(`Contract limit (${contractMaxEth.toFixed(6)} ETH)`, 'info', 2000);
                } 
            } catch (e) {
                console.warn("Could not fetch contract maxDeposit.", e);
            }
        }

            depositAmountInput.value = finalDepositEth.toFixed(6);         
            showStatus(`Max deposit set to ${finalDepositEth.toFixed(6)} ETH (reserving gas fee)`, 'success');
        } catch (error) {
            console.error('Failed to set max deposit:', error);
            showStatus('Could not fetch max deposit', 'error');
        }
    }

    //====================
    //  WITHDRAW ALL
    //====================
    async function withdrawAll() {
        if (!bankContract || !userAccount) {
            showStatus('Connect wallet first', 'error');
            return;
        }
        try {
            const balanceWei = await bankContract.methods.getBalance().call({ from: userAccount });
            const balanceEth = web3.utils.fromWei(balanceWei, 'ether');
            if (balanceWei == 0) {
                showStatus('No balance to withdraw', 'info');
                withdrawAmountInput.value = "";
                return;
            }
            
            withdrawAmountInput.value = parseFloat(balanceEth).toFixed(6);
            showStatus(`Withdraw amount set to ${balanceEth} ETH. Click Withdraw to confirm.`, 'success');
        } catch (error) {
            console.error('Withdraw all error.', error);
            showStatus('Failed to get balance', 'error');
        }
    }

    //===========================
    //UNIQUE DEPOSITORS
    //===========================

    async function updateUniqueDepositors() {
        if (!bankContract) return;
        try {
            const depositEvents = await getPastEventsWithFallback('Deposit');
            const uniqueAddresses = new Set(depositEvents.map(e => e.returnValues.user));
            const count = uniqueAddresses.size;
            if (depositorCountSpan) depositorCountSpan.innerText = count;
        } catch (error) {
            console.error('Failed to fetch depositor count:', error);
        }
    }

   
    // ==========================
    // EVENT LISTENERS
    // ==========================
    if (connectButton) connectButton.addEventListener("click", connectWallet);
    if (refreshButton) refreshButton.addEventListener("click", updateBalances);
    if (suiteRefreshButton) suiteRefreshButton.addEventListener("click", updateSuiteDashboard);
    if (depositButton) depositButton.addEventListener("click", deposit);
    if (withdrawButton) withdrawButton.addEventListener("click", withdraw);
    if (claimInterestButton) claimInterestButton.addEventListener("click", claimInterest);
    if (refreshHistoryButton) refreshHistoryButton.addEventListener("click", loadTransactionHistory);
    if (maxDepositButton) maxDepositButton.addEventListener('click', setMaxDeposit);
    if (withdrawAllButton) withdrawAllButton.addEventListener('click', withdrawAll);
    if (fundReserveButton) fundReserveButton.addEventListener('click', fundInterestReserveAdmin);
    if (setDepositFeeButton) setDepositFeeButton.addEventListener('click', setDepositFeeAdmin);
    if (setWithdrawalFeeButton) setWithdrawalFeeButton.addEventListener('click', setWithdrawalFeeAdmin);
    if (setWithdrawalLockButton) setWithdrawalLockButton.addEventListener('click', setWithdrawalLockAdmin);
    if (claimProtocolFeesButton) claimProtocolFeesButton.addEventListener('click', claimProtocolFeesAdmin);
    if (refreshAdminButton) refreshAdminButton.addEventListener('click', updateAdminPanel);
    if (vaultDepositButton) vaultDepositButton.addEventListener('click', depositVaultETH);
    if (vaultRedeemButton) vaultRedeemButton.addEventListener('click', redeemVaultETH);
    if (vaultRedeemAllButton) vaultRedeemAllButton.addEventListener('click', setVaultRedeemAll);
    if (vaultRefreshButton) vaultRefreshButton.addEventListener('click', refreshVaultAndManager);
    if (vaultHarvestButton) vaultHarvestButton.addEventListener('click', harvestVaultPerformanceFee);
    if (vaultSetPerformanceFeeButton) vaultSetPerformanceFeeButton.addEventListener('click', setVaultPerformanceFeeAdmin);
    if (vaultSetMaxAssetsButton) vaultSetMaxAssetsButton.addEventListener('click', setVaultMaxAssetsAdmin);
    if (vaultSetTreasuryButton) vaultSetTreasuryButton.addEventListener('click', setVaultTreasuryAdmin);
    if (vaultPauseButton) vaultPauseButton.addEventListener('click', pauseVaultAdmin);
    if (vaultUnpauseButton) vaultUnpauseButton.addEventListener('click', unpauseVaultAdmin);
    if (managerRefreshButton) managerRefreshButton.addEventListener('click', refreshVaultAndManager);
    if (managerSetStrategyCapButton) managerSetStrategyCapButton.addEventListener('click', setManagerStrategyCapAdmin);
    if (managerSetDefaultStrategyButton) managerSetDefaultStrategyButton.addEventListener('click', setManagerDefaultStrategyAdmin);
    if (managerDivestAllButton) managerDivestAllButton.addEventListener('click', divestManagerStrategyAdmin);
    if (managerRebalanceButton) managerRebalanceButton.addEventListener('click', rebalanceManagerStrategyAdmin);
    if (lendingSupplyButton) lendingSupplyButton.addEventListener('click', supplyLendingETH);
    if (lendingWithdrawAllButton) lendingWithdrawAllButton.addEventListener('click', setLendingWithdrawAll);
    if (lendingWithdrawSupplyButton) lendingWithdrawSupplyButton.addEventListener('click', withdrawLendingSupply);
    if (lendingDepositCollateralButton) lendingDepositCollateralButton.addEventListener('click', depositLendingCollateral);
    if (lendingBorrowButton) lendingBorrowButton.addEventListener('click', borrowLending);
    if (lendingBorrowWithCollateralButton) lendingBorrowWithCollateralButton.addEventListener('click', borrowWithLendingCollateral);
    if (lendingRepayButton) lendingRepayButton.addEventListener('click', repayLending);
    if (lendingRepayAllButton) lendingRepayAllButton.addEventListener('click', repayAllLending);
    if (lendingWithdrawCollateralButton) lendingWithdrawCollateralButton.addEventListener('click', withdrawLendingCollateral);
    if (lendingLiquidateButton) lendingLiquidateButton.addEventListener('click', liquidateLending);
    if (lendingRefreshButton) lendingRefreshButton.addEventListener('click', refreshLending);
    if (lendingSetRatesButton) lendingSetRatesButton.addEventListener('click', setLendingRatesAdmin);
    if (lendingSetRiskButton) lendingSetRiskButton.addEventListener('click', setLendingRiskAdmin);
    if (lendingSetMaxLiquidityButton) lendingSetMaxLiquidityButton.addEventListener('click', setLendingMaxLiquidityAdmin);
    if (lendingSetTreasuryButton) lendingSetTreasuryButton.addEventListener('click', setLendingTreasuryAdmin);
    if (lendingClaimFeesButton) lendingClaimFeesButton.addEventListener('click', claimLendingFeesAdmin);
    if (lendingPauseButton) lendingPauseButton.addEventListener('click', pauseLendingAdmin);
    if (lendingUnpauseButton) lendingUnpauseButton.addEventListener('click', unpauseLendingAdmin);
    if (swapAddLiquidityButton) swapAddLiquidityButton.addEventListener('click', addSwapLiquidity);
    if (swapRemoveAllButton) swapRemoveAllButton.addEventListener('click', setSwapRemoveAll);
    if (swapRemoveLiquidityButton) swapRemoveLiquidityButton.addEventListener('click', removeSwapLiquidity);
    if (swapTokenInSelect) swapTokenInSelect.addEventListener('change', updateSwapQuote);
    if (swapAmountInInput) swapAmountInInput.addEventListener('input', () => updateSwapQuote({ silent: true }));
    if (swapExecuteButton) swapExecuteButton.addEventListener('click', executeSwap);
    if (swapRefreshButton) swapRefreshButton.addEventListener('click', refreshSwap);
    if (swapSetFeeButton) swapSetFeeButton.addEventListener('click', setSwapFeeAdmin);
    if (swapSetProtocolShareButton) swapSetProtocolShareButton.addEventListener('click', setSwapProtocolShareAdmin);
    if (swapSetTreasuryButton) swapSetTreasuryButton.addEventListener('click', setSwapTreasuryAdmin);
    if (swapClaimFeesButton) swapClaimFeesButton.addEventListener('click', claimSwapFeesAdmin);
    if (swapPauseButton) swapPauseButton.addEventListener('click', pauseSwapAdmin);
    if (swapUnpauseButton) swapUnpauseButton.addEventListener('click', unpauseSwapAdmin);


    //========================
    //  AUTO REFRESH
    //========================
    let autoRefreshInterval;
    function startAutoRefresh() {
        if (autoRefreshInterval) clearInterval(autoRefreshInterval);
        autoRefreshInterval = setInterval(() => {
            if (bankContract && userAccount) {
                updateBalances({ silent: true });
                updateSuiteDashboard({ silent: true });
                updateAdminPanel({ silent: true });
                updateVaultPanel({ silent: true });
                updateStrategyManagerPanel({ silent: true });
                updateLendingPanel({ silent: true });
                updateSwapPanel({ silent: true });
            }
        }, 30000);
    }
    function stopAutoRefresh() {
        if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    }

    showStatus('Ready to connect. Click "Connect MetaMask".', "info");
    console.log('SimpleBank dApp initialized with enhanced features');
