// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract SimpleLendingPool is Ownable2Step, Pausable, ReentrancyGuard {
    error ZeroAddress();
    error ZeroAmount();
    error ZeroShares();
    error FeeTooHigh(uint256 provided, uint256 maxAllowed);
    error RateTooHigh(uint256 provided, uint256 maxAllowed);
    error InvalidRiskParameters();
    error MaxPoolLiquidityExceeded(uint256 attempted, uint256 maxAllowed);
    error InsufficientLiquidity(uint256 requested, uint256 available);
    error InsufficientShares(uint256 requested, uint256 available);
    error InsufficientCollateral(uint256 requested, uint256 available);
    error LoanNotFound(address borrower);
    error BorrowLimitExceeded(uint256 attemptedDebt, uint256 maxDebt);
    error HealthyLoan(address borrower, uint256 healthFactorBps);
    error NoProtocolFees();
    error ETHTransferFailed();
    error RenounceOwnershipDisabled();

    struct Loan {
        uint256 collateral;
        uint256 debt;
        uint256 lastAccrualTimestamp;
    }

    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MAX_BORROW_APR_BPS = 5000;
    uint256 public constant MAX_ORIGINATION_FEE_BPS = 100;
    uint256 public constant MAX_LTV_BPS = 8000;
    uint256 public constant MAX_LIQUIDATION_THRESHOLD_BPS = 9000;
    uint256 public constant MAX_LIQUIDATION_BONUS_BPS = 2000;

    mapping(address => uint256) public supplyShares;
    mapping(address => Loan) public loans;

    address public treasury;
    uint16 public borrowAprBps;
    uint16 public originationFeeBps;
    uint16 public maxLtvBps = 6000;
    uint16 public liquidationThresholdBps = 8000;
    uint16 public liquidationBonusBps = 500;
    uint256 public maxPoolLiquidity;
    uint256 public totalSupplyShares;
    uint256 public totalBorrowDebt;
    uint256 public totalCollateral;
    uint256 public protocolFees;

    event Supplied(address indexed supplier, uint256 assets, uint256 shares);
    event SupplyWithdrawn(address indexed supplier, uint256 assets, uint256 shares);
    event CollateralDeposited(address indexed borrower, uint256 amount);
    event CollateralWithdrawn(address indexed borrower, uint256 amount);
    event Borrowed(address indexed borrower, uint256 amount, uint256 originationFee, uint256 payout);
    event Repaid(address indexed borrower, uint256 paidAmount, uint256 remainingDebt);
    event Liquidated(
        address indexed borrower,
        address indexed liquidator,
        uint256 repayAmount,
        uint256 collateralSeized
    );
    event InterestAccrued(address indexed borrower, uint256 interest, uint256 newDebt);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event BorrowAprUpdated(uint256 oldBorrowAprBps, uint256 newBorrowAprBps);
    event OriginationFeeUpdated(uint256 oldOriginationFeeBps, uint256 newOriginationFeeBps);
    event RiskParametersUpdated(uint256 maxLtvBps, uint256 liquidationThresholdBps, uint256 liquidationBonusBps);
    event MaxPoolLiquidityUpdated(uint256 oldMaxPoolLiquidity, uint256 newMaxPoolLiquidity);
    event ProtocolFeesClaimed(address indexed treasury, uint256 amount);

    constructor(
        address initialOwner,
        address initialTreasury,
        uint256 initialBorrowAprBps,
        uint256 initialOriginationFeeBps,
        uint256 initialMaxPoolLiquidity
    ) {
        if (initialOwner == address(0) || initialTreasury == address(0)) revert ZeroAddress();
        if (initialBorrowAprBps > MAX_BORROW_APR_BPS) {
            revert RateTooHigh(initialBorrowAprBps, MAX_BORROW_APR_BPS);
        }
        if (initialOriginationFeeBps > MAX_ORIGINATION_FEE_BPS) {
            revert FeeTooHigh(initialOriginationFeeBps, MAX_ORIGINATION_FEE_BPS);
        }

        _transferOwnership(initialOwner);
        treasury = initialTreasury;
        borrowAprBps = uint16(initialBorrowAprBps);
        originationFeeBps = uint16(initialOriginationFeeBps);
        maxPoolLiquidity = initialMaxPoolLiquidity;
    }

    function totalAssets() public view returns (uint256) {
        return availableLiquidity() + totalBorrowDebt;
    }

    function availableLiquidity() public view returns (uint256) {
        return _availableLiquidity(address(this).balance);
    }

    function supplyBalanceOf(address supplier) public view returns (uint256) {
        uint256 shares = supplyShares[supplier];
        uint256 shareSupply = totalSupplyShares;
        if (shares == 0 || shareSupply == 0) return 0;
        return (shares * totalAssets()) / shareSupply;
    }

    function previewSupplyShares(uint256 assets) public view returns (uint256) {
        if (assets == 0) return 0;

        uint256 poolAssets = totalAssets();
        uint256 shareSupply = totalSupplyShares;
        if (shareSupply == 0 || poolAssets == 0) return assets;
        return (assets * shareSupply) / poolAssets;
    }

    function previewSupplyAssets(uint256 shares) public view returns (uint256) {
        uint256 shareSupply = totalSupplyShares;
        if (shares == 0 || shareSupply == 0) return 0;
        return (shares * totalAssets()) / shareSupply;
    }

    function previewDebt(address borrower) public view returns (uint256) {
        return _accruedDebt(loans[borrower]);
    }

    function borrowCapacity(address borrower) public view returns (uint256) {
        Loan memory loan = loans[borrower];
        uint256 maxDebt = (loan.collateral * maxLtvBps) / BASIS_POINTS;
        uint256 debt = _accruedDebt(loan);
        if (debt >= maxDebt) return 0;
        return maxDebt - debt;
    }

    function healthFactorBps(address borrower) public view returns (uint256) {
        Loan memory loan = loans[borrower];
        uint256 debt = _accruedDebt(loan);
        if (debt == 0) return type(uint256).max;
        return (loan.collateral * liquidationThresholdBps) / debt;
    }

    function isLiquidatable(address borrower) public view returns (bool) {
        Loan memory loan = loans[borrower];
        uint256 debt = _accruedDebt(loan);
        if (debt == 0 || loan.collateral == 0) return false;
        return (debt * BASIS_POINTS) > (loan.collateral * liquidationThresholdBps);
    }

    function supply() public payable whenNotPaused nonReentrant returns (uint256 shares) {
        if (msg.value == 0) revert ZeroAmount();

        uint256 assetsBefore = _totalAssetsWithBalance(address(this).balance - msg.value);
        if (maxPoolLiquidity > 0 && assetsBefore + msg.value > maxPoolLiquidity) {
            revert MaxPoolLiquidityExceeded(assetsBefore + msg.value, maxPoolLiquidity);
        }

        uint256 shareSupply = totalSupplyShares;
        shares = shareSupply == 0 || assetsBefore == 0 ? msg.value : (msg.value * shareSupply) / assetsBefore;
        if (shares == 0) revert ZeroShares();

        supplyShares[msg.sender] += shares;
        totalSupplyShares = shareSupply + shares;

        emit Supplied(msg.sender, msg.value, shares);
    }

    function withdrawSupply(uint256 shares) external nonReentrant returns (uint256 assets) {
        if (shares == 0) revert ZeroShares();

        uint256 userShares = supplyShares[msg.sender];
        if (shares > userShares) revert InsufficientShares(shares, userShares);

        assets = previewSupplyAssets(shares);
        uint256 liquidity = availableLiquidity();
        if (assets > liquidity) revert InsufficientLiquidity(assets, liquidity);
        if (assets == 0) revert ZeroAmount();

        supplyShares[msg.sender] = userShares - shares;
        totalSupplyShares -= shares;

        emit SupplyWithdrawn(msg.sender, assets, shares);
        _sendETH(payable(msg.sender), assets);
    }

    function depositCollateral() public payable whenNotPaused nonReentrant {
        if (msg.value == 0) revert ZeroAmount();

        loans[msg.sender].collateral += msg.value;
        totalCollateral += msg.value;

        emit CollateralDeposited(msg.sender, msg.value);
    }

    function borrowWithCollateral(uint256 borrowAmount) external payable whenNotPaused nonReentrant {
        if (msg.value == 0) revert ZeroAmount();

        loans[msg.sender].collateral += msg.value;
        totalCollateral += msg.value;
        emit CollateralDeposited(msg.sender, msg.value);

        _borrow(msg.sender, borrowAmount);
    }

    function borrow(uint256 amount) external whenNotPaused nonReentrant {
        _borrow(msg.sender, amount);
    }

    function repay() external payable nonReentrant returns (uint256 paidAmount) {
        if (msg.value == 0) revert ZeroAmount();

        Loan storage loan = loans[msg.sender];
        if (loan.debt == 0) revert LoanNotFound(msg.sender);
        _accrueDebt(msg.sender);

        uint256 debt = loan.debt;
        paidAmount = msg.value > debt ? debt : msg.value;
        uint256 refund = msg.value - paidAmount;

        loan.debt = debt - paidAmount;
        totalBorrowDebt -= paidAmount;
        if (loan.debt == 0) {
            loan.lastAccrualTimestamp = 0;
        }

        emit Repaid(msg.sender, paidAmount, loan.debt);

        if (refund > 0) {
            _sendETH(payable(msg.sender), refund);
        }
    }

    function withdrawCollateral(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        Loan storage loan = loans[msg.sender];
        if (amount > loan.collateral) revert InsufficientCollateral(amount, loan.collateral);
        _accrueDebt(msg.sender);

        uint256 updatedCollateral = loan.collateral - amount;
        uint256 debt = loan.debt;
        if (debt > 0) {
            uint256 maxDebt = (updatedCollateral * maxLtvBps) / BASIS_POINTS;
            if (debt > maxDebt) revert BorrowLimitExceeded(debt, maxDebt);
        }

        loan.collateral = updatedCollateral;
        totalCollateral -= amount;

        emit CollateralWithdrawn(msg.sender, amount);
        _sendETH(payable(msg.sender), amount);
    }

    function liquidate(address borrower) external payable whenNotPaused nonReentrant {
        if (msg.value == 0) revert ZeroAmount();

        _accrueDebt(borrower);
        Loan storage loan = loans[borrower];
        uint256 debt = loan.debt;
        if (debt == 0) revert LoanNotFound(borrower);

        uint256 currentHealthFactor = healthFactorBps(borrower);
        if (currentHealthFactor >= BASIS_POINTS) {
            revert HealthyLoan(borrower, currentHealthFactor);
        }

        uint256 repayAmount = msg.value > debt ? debt : msg.value;
        uint256 collateralSeized = repayAmount + ((repayAmount * liquidationBonusBps) / BASIS_POINTS);
        if (collateralSeized > loan.collateral) {
            collateralSeized = loan.collateral;
        }
        uint256 refund = msg.value - repayAmount;

        loan.debt = debt - repayAmount;
        totalBorrowDebt -= repayAmount;
        loan.collateral -= collateralSeized;
        totalCollateral -= collateralSeized;
        if (loan.debt == 0) {
            loan.lastAccrualTimestamp = 0;
        }

        emit Liquidated(borrower, msg.sender, repayAmount, collateralSeized);

        _sendETH(payable(msg.sender), collateralSeized);
        if (refund > 0) {
            _sendETH(payable(msg.sender), refund);
        }
    }

    function claimProtocolFees() external onlyOwner nonReentrant returns (uint256 amount) {
        amount = protocolFees;
        if (amount == 0) revert NoProtocolFees();

        protocolFees = 0;
        emit ProtocolFeesClaimed(treasury, amount);
        _sendETH(payable(treasury), amount);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();

        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    function setBorrowAprBps(uint256 newBorrowAprBps) external onlyOwner {
        if (newBorrowAprBps > MAX_BORROW_APR_BPS) {
            revert RateTooHigh(newBorrowAprBps, MAX_BORROW_APR_BPS);
        }

        uint256 oldBorrowAprBps = borrowAprBps;
        borrowAprBps = uint16(newBorrowAprBps);
        emit BorrowAprUpdated(oldBorrowAprBps, newBorrowAprBps);
    }

    function setOriginationFeeBps(uint256 newOriginationFeeBps) external onlyOwner {
        if (newOriginationFeeBps > MAX_ORIGINATION_FEE_BPS) {
            revert FeeTooHigh(newOriginationFeeBps, MAX_ORIGINATION_FEE_BPS);
        }

        uint256 oldOriginationFeeBps = originationFeeBps;
        originationFeeBps = uint16(newOriginationFeeBps);
        emit OriginationFeeUpdated(oldOriginationFeeBps, newOriginationFeeBps);
    }

    function setRiskParameters(
        uint256 newMaxLtvBps,
        uint256 newLiquidationThresholdBps,
        uint256 newLiquidationBonusBps
    ) external onlyOwner {
        if (
            newMaxLtvBps > MAX_LTV_BPS ||
            newLiquidationThresholdBps > MAX_LIQUIDATION_THRESHOLD_BPS ||
            newMaxLtvBps > newLiquidationThresholdBps ||
            newLiquidationBonusBps > MAX_LIQUIDATION_BONUS_BPS
        ) {
            revert InvalidRiskParameters();
        }

        maxLtvBps = uint16(newMaxLtvBps);
        liquidationThresholdBps = uint16(newLiquidationThresholdBps);
        liquidationBonusBps = uint16(newLiquidationBonusBps);

        emit RiskParametersUpdated(newMaxLtvBps, newLiquidationThresholdBps, newLiquidationBonusBps);
    }

    function setMaxPoolLiquidity(uint256 newMaxPoolLiquidity) external onlyOwner {
        uint256 oldMaxPoolLiquidity = maxPoolLiquidity;
        maxPoolLiquidity = newMaxPoolLiquidity;
        emit MaxPoolLiquidityUpdated(oldMaxPoolLiquidity, newMaxPoolLiquidity);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function transferOwnership(address newOwner) public override onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        super.transferOwnership(newOwner);
    }

    function renounceOwnership() public view override onlyOwner {
        revert RenounceOwnershipDisabled();
    }

    function _borrow(address borrower, uint256 amount) private {
        if (amount == 0) revert ZeroAmount();

        Loan storage loan = loans[borrower];
        if (loan.collateral == 0) revert InsufficientCollateral(1, 0);
        _accrueDebt(borrower);

        uint256 updatedDebt = loan.debt + amount;
        uint256 maxDebt = (loan.collateral * maxLtvBps) / BASIS_POINTS;
        if (updatedDebt > maxDebt) revert BorrowLimitExceeded(updatedDebt, maxDebt);

        uint256 liquidity = availableLiquidity();
        if (amount > liquidity) revert InsufficientLiquidity(amount, liquidity);

        uint256 originationFee = (amount * originationFeeBps) / BASIS_POINTS;
        uint256 payout = amount - originationFee;

        loan.debt = updatedDebt;
        loan.lastAccrualTimestamp = block.timestamp;
        totalBorrowDebt += amount;
        protocolFees += originationFee;

        emit Borrowed(borrower, amount, originationFee, payout);
        _sendETH(payable(borrower), payout);
    }

    function _accruedDebt(Loan memory loan) private view returns (uint256) {
        if (loan.debt == 0 || loan.lastAccrualTimestamp == 0) return loan.debt;

        uint256 elapsed = block.timestamp - loan.lastAccrualTimestamp;
        if (elapsed == 0 || borrowAprBps == 0) return loan.debt;

        uint256 interest = (loan.debt * borrowAprBps * elapsed) / (365 days * BASIS_POINTS);
        return loan.debt + interest;
    }

    function _accrueDebt(address borrower) private returns (uint256 interest) {
        Loan storage loan = loans[borrower];
        if (loan.debt == 0 || loan.lastAccrualTimestamp == 0) return 0;

        uint256 updatedDebt = _accruedDebt(loan);
        interest = updatedDebt - loan.debt;
        if (interest == 0) return 0;

        loan.debt = updatedDebt;
        loan.lastAccrualTimestamp = block.timestamp;
        totalBorrowDebt += interest;

        emit InterestAccrued(borrower, interest, updatedDebt);
    }

    function _availableLiquidity(uint256 balance) private view returns (uint256) {
        uint256 protectedAssets = totalCollateral + protocolFees;
        if (balance <= protectedAssets) return 0;
        return balance - protectedAssets;
    }

    function _totalAssetsWithBalance(uint256 balance) private view returns (uint256) {
        return _availableLiquidity(balance) + totalBorrowDebt;
    }

    function _sendETH(address payable receiver, uint256 amount) private {
        (bool success, ) = receiver.call{value: amount}("");
        if (!success) revert ETHTransferFailed();
    }

    receive() external payable {
        supply();
    }
}
