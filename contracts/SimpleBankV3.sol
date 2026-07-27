// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract SimpleBankV3 is Ownable2Step, ReentrancyGuard, Pausable {
    error ZeroDeposit();
    error ZeroWithdrawal();
    error ZeroRecovery();
    error InsufficientBalance(uint256 requested, uint256 available);
    error NoInterestYet();
    error RateTooHigh(uint256 provided, uint256 maxAllowed);
    error MaxDepositExceeded(uint256 amount, uint256 max);
    error MaxTotalDepositsExceeded(uint256 amount, uint256 max);
    error BelowMinDeposit(uint256 sent, uint256 required);
    error WithdrawalLocked(uint256 unlockTime, uint256 currentTime);
    error ZeroFunding();
    error ZeroOwner();
    error ZeroTreasury();
    error InsufficientInterestReserve(uint256 required, uint256 available);
    error NoRecoverableSurplus(uint256 requested, uint256 available);
    error DepositLimitTooHigh(uint256 provided, uint256 maxAllowed);
    error MinDepositExceedsMaxDeposit(uint256 minDeposit, uint256 maxDeposit);
    error WithdrawalLockOutOfRange(uint256 provided, uint256 minAllowed, uint256 maxAllowed);
    error FeeTooHigh(uint256 provided, uint256 maxAllowed);
    error NoProtocolFees();
    error RenounceOwnershipDisabled();

    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MAX_INTEREST_RATE = 500;
    uint256 public constant MAX_DEPOSIT_LIMIT = type(uint128).max;
    uint256 public constant MIN_WITHDRAWAL_LOCK_DAYS = 1;
    uint256 public constant MAX_WITHDRAWAL_LOCK_DAYS = 30;
    uint256 public constant MAX_FEE_BPS = 100;

    mapping(address => uint256) private _balances;
    mapping(address => uint256) private _lastInterestTimestamp;
    mapping(address => uint256) public lastDepositTime;

    address public treasury;
    uint16 public interestRate;
    uint16 public depositFeeBps;
    uint16 public withdrawalFeeBps;
    uint16 public withdrawalLockDays = 7;
    uint256 public totalDeposits;
    uint256 public interestReserve;
    uint256 public protocolFees;
    uint256 public maxTotalDeposits;
    uint128 public maxDeposit;
    uint128 public minDeposit;

    event Deposit(address indexed user, uint256 amount);
    event WithdrawalMade(address indexed user, uint256 amount);
    event InterestClaimed(address indexed user, uint256 interest);
    event InterestRateUpdated(uint256 oldRate, uint256 newRate);
    event MaxDepositUpdated(uint256 oldMax, uint256 newMax);
    event MaxTotalDepositsUpdated(uint256 oldMax, uint256 newMax);
    event MinDepositUpdated(uint256 oldMin, uint256 newMin);
    event WithdrawalLockDaysUpdated(uint256 oldDays, uint256 newDays);
    event InterestReserveFunded(address indexed funder, uint256 amount);
    event ETHRecovered(address indexed recipient, uint256 amount);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event DepositFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event WithdrawalFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event DepositFeeCollected(address indexed user, uint256 fee, uint256 grossAmount, uint256 creditedAmount);
    event WithdrawalFeeCollected(address indexed user, uint256 fee, uint256 debitedAmount, uint256 payoutAmount);
    event ProtocolFeesClaimed(address indexed treasury, uint256 amount);

    constructor(
        uint256 _initialInterestRate,
        address initialOwner,
        uint256 initialMaxTotalDeposits,
        address initialTreasury
    ) {
        if (_initialInterestRate > MAX_INTEREST_RATE) revert RateTooHigh(_initialInterestRate, MAX_INTEREST_RATE);
        if (initialOwner == address(0)) revert ZeroOwner();
        if (initialTreasury == address(0)) revert ZeroTreasury();

        _transferOwnership(initialOwner);
        treasury = initialTreasury;
        interestRate = uint16(_initialInterestRate);
        maxTotalDeposits = initialMaxTotalDeposits;
    }

    function _calculateFee(uint256 amount, uint16 feeBps) private pure returns (uint256) {
        if (feeBps == 0) return 0;
        return (amount * feeBps) / BASIS_POINTS;
    }

    function _enforceDepositLimits(uint256 amount) private view {
        if (maxDeposit > 0 && _balances[msg.sender] + amount > maxDeposit) {
            revert MaxDepositExceeded(_balances[msg.sender] + amount, maxDeposit);
        }

        if (maxTotalDeposits > 0 && totalDeposits + amount > maxTotalDeposits) {
            revert MaxTotalDepositsExceeded(totalDeposits + amount, maxTotalDeposits);
        }
    }

    function _calculatePendingInterest(address user) private view returns (uint256) {
        uint256 balance = _balances[user];
        if (balance == 0) return 0;

        uint256 timePassed = block.timestamp - _lastInterestTimestamp[user];
        if (timePassed < 1 days) return 0;

        return (balance * interestRate * timePassed) / (365 days * BASIS_POINTS);
    }

    function _applyInterest(address user) private returns (uint256) {
        uint256 interest = _calculatePendingInterest(user);
        if (interest > 0) {
            if (interestReserve < interest) {
                revert InsufficientInterestReserve(interest, interestReserve);
            }

            interestReserve -= interest;
            _balances[user] += interest;
            totalDeposits += interest;
            _lastInterestTimestamp[user] = block.timestamp;
            emit InterestClaimed(user, interest);
        }

        return interest;
    }

    function deposit() public payable whenNotPaused nonReentrant {
        if (msg.value == 0) revert ZeroDeposit();
        if (minDeposit > 0 && msg.value < minDeposit) revert BelowMinDeposit(msg.value, minDeposit);

        _applyInterest(msg.sender);

        uint256 fee = _calculateFee(msg.value, depositFeeBps);
        uint256 creditedAmount = msg.value - fee;
        _enforceDepositLimits(creditedAmount);

        unchecked {
            _balances[msg.sender] += creditedAmount;
            totalDeposits += creditedAmount;
        }

        if (fee > 0) {
            protocolFees += fee;
            emit DepositFeeCollected(msg.sender, fee, msg.value, creditedAmount);
        }

        _lastInterestTimestamp[msg.sender] = block.timestamp;
        lastDepositTime[msg.sender] = block.timestamp;
        emit Deposit(msg.sender, creditedAmount);
    }

    function withdraw(uint256 amount) public nonReentrant {
        if (amount == 0) revert ZeroWithdrawal();

        uint256 unlockTime = lastDepositTime[msg.sender] + (uint256(withdrawalLockDays) * 1 days);
        if (block.timestamp < unlockTime) {
            revert WithdrawalLocked(unlockTime, block.timestamp);
        }

        uint256 balance = _balances[msg.sender];
        if (balance < amount) revert InsufficientBalance(amount, balance);

        uint256 fee = _calculateFee(amount, withdrawalFeeBps);
        uint256 payoutAmount = amount - fee;

        unchecked {
            _balances[msg.sender] -= amount;
            totalDeposits -= amount;
        }

        if (fee > 0) {
            protocolFees += fee;
            emit WithdrawalFeeCollected(msg.sender, fee, amount, payoutAmount);
        }

        (bool success, ) = payable(msg.sender).call{value: payoutAmount}("");
        require(success, "ETH transfer failed");
        emit WithdrawalMade(msg.sender, amount);
    }

    function claimInterest() external whenNotPaused nonReentrant returns (uint256) {
        uint256 interest = _applyInterest(msg.sender);
        if (interest == 0) revert NoInterestYet();
        return interest;
    }

    function claimProtocolFees() external onlyOwner nonReentrant returns (uint256) {
        uint256 amount = protocolFees;
        if (amount == 0) revert NoProtocolFees();

        protocolFees = 0;
        emit ProtocolFeesClaimed(treasury, amount);

        (bool success, ) = payable(treasury).call{value: amount}("");
        require(success, "Protocol fee transfer failed");
        return amount;
    }

    function getBalance() external view returns (uint256) {
        return _balances[msg.sender];
    }

    function getBalanceOf(address user) external view returns (uint256) {
        return _balances[user];
    }

    function getBalanceWithInterest() external view returns (uint256) {
        uint256 balance = _balances[msg.sender];
        if (balance == 0) return 0;
        return balance + _calculatePendingInterest(msg.sender);
    }

    function getPendingInterest(address user) external view returns (uint256) {
        return _calculatePendingInterest(user);
    }

    function getClaimableInterest(address user) external view returns (uint256) {
        uint256 pendingInterest = _calculatePendingInterest(user);
        if (pendingInterest == 0 || interestReserve < pendingInterest) return 0;
        return pendingInterest;
    }

    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function getRecoverableETH() public view returns (uint256) {
        uint256 requiredBacking = totalDeposits + interestReserve + protocolFees;
        uint256 contractBalance = address(this).balance;
        if (contractBalance <= requiredBacking) return 0;
        return contractBalance - requiredBacking;
    }

    function getLastInterestTime(address user) external view returns (uint256) {
        return _lastInterestTimestamp[user];
    }

    function getLastDepositTime(address user) public view returns (uint256) {
        return lastDepositTime[user];
    }

    function setInterestRate(uint256 newRate) external onlyOwner {
        if (newRate > MAX_INTEREST_RATE) revert RateTooHigh(newRate, MAX_INTEREST_RATE);
        uint256 oldRate = interestRate;
        interestRate = uint16(newRate);
        emit InterestRateUpdated(oldRate, newRate);
    }

    function setDepositFeeBps(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh(newFeeBps, MAX_FEE_BPS);
        uint256 oldFeeBps = depositFeeBps;
        depositFeeBps = uint16(newFeeBps);
        emit DepositFeeUpdated(oldFeeBps, newFeeBps);
    }

    function setWithdrawalFeeBps(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh(newFeeBps, MAX_FEE_BPS);
        uint256 oldFeeBps = withdrawalFeeBps;
        withdrawalFeeBps = uint16(newFeeBps);
        emit WithdrawalFeeUpdated(oldFeeBps, newFeeBps);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroTreasury();
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    function setMaxDeposit(uint256 newMax) external onlyOwner {
        if (newMax > MAX_DEPOSIT_LIMIT) revert DepositLimitTooHigh(newMax, MAX_DEPOSIT_LIMIT);
        if (newMax > 0 && minDeposit > newMax) revert MinDepositExceedsMaxDeposit(minDeposit, newMax);

        uint256 oldMax = maxDeposit;
        maxDeposit = uint128(newMax);
        emit MaxDepositUpdated(oldMax, newMax);
    }

    function setMaxTotalDeposits(uint256 newMax) external onlyOwner {
        uint256 oldMax = maxTotalDeposits;
        maxTotalDeposits = newMax;
        emit MaxTotalDepositsUpdated(oldMax, newMax);
    }

    function setMinDeposit(uint256 newMin) external onlyOwner {
        if (newMin > MAX_DEPOSIT_LIMIT) revert DepositLimitTooHigh(newMin, MAX_DEPOSIT_LIMIT);
        if (maxDeposit > 0 && newMin > maxDeposit) revert MinDepositExceedsMaxDeposit(newMin, maxDeposit);

        uint256 oldMin = minDeposit;
        minDeposit = uint128(newMin);
        emit MinDepositUpdated(oldMin, newMin);
    }

    function setWithdrawalLockDays(uint256 daysLock) external onlyOwner {
        if (daysLock < MIN_WITHDRAWAL_LOCK_DAYS || daysLock > MAX_WITHDRAWAL_LOCK_DAYS) {
            revert WithdrawalLockOutOfRange(daysLock, MIN_WITHDRAWAL_LOCK_DAYS, MAX_WITHDRAWAL_LOCK_DAYS);
        }

        uint256 oldDays = withdrawalLockDays;
        withdrawalLockDays = uint16(daysLock);
        emit WithdrawalLockDaysUpdated(oldDays, daysLock);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function fundInterestReserve() external payable onlyOwner {
        if (msg.value == 0) revert ZeroFunding();
        interestReserve += msg.value;
        emit InterestReserveFunded(msg.sender, msg.value);
    }

    function recoverETH(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroRecovery();

        uint256 recoverable = getRecoverableETH();
        if (amount > recoverable) revert NoRecoverableSurplus(amount, recoverable);

        emit ETHRecovered(owner(), amount);
        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Transfer failed");
    }

    function transferOwnership(address newOwner) public override onlyOwner {
        if (newOwner == address(0)) revert ZeroOwner();
        super.transferOwnership(newOwner);
    }

    function renounceOwnership() public view override onlyOwner {
        revert RenounceOwnershipDisabled();
    }

    receive() external payable whenNotPaused {
        deposit();
    }
}
