// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

contract SimpleBankV2 is Ownable, ReentrancyGuard, Pausable {

    // ========= ERRORS =========
    error ZeroDeposit();
    error ZeroWithdrawal();
    error InsufficientBalance(uint256 requested, uint256 available);
    error NoInterestYet();
    error RateTooHigh(uint256 provided, uint256 maxAllowed);
    error MaxDepositExceeded(uint256 amount, uint256 max);
    error BelowMinDeposit(uint256 sent, uint256 required);
    
    // ========= STATE =========
    mapping(address => uint256) private _balances;
    mapping(address => uint256) private _lastInterestTimestamp;

    uint256 public interestRate; // basis points (100 = 1%)
    uint256 public totalDeposits;
    uint256 public maxDeposit;
    uint256 public minDeposit;
    
    // ========= EVENTS =========
    event Deposit(address indexed user, uint256 amount);
    event Withdrawal(address indexed user, uint256 amount);
    event InterestClaimed(address indexed user, uint256 interest);
    event InterestRateUpdated(uint256 oldRate, uint256 newRate);
    event MaxDepositUpdated(uint256 oldMax, uint256 newMax);
    event MinDepositUpdated(uint256 oldMin, uint256 newMin);

    // ========= CONSTRUCTOR =========
    constructor(uint256 _initialInterestRate) {
        require(_initialInterestRate <= 500, "Rate too high (max 5%)");
    interestRate = _initialInterestRate;
}
    // ========= MODIFIER =========
    modifier respectMaxDeposit(uint256 amount) {
        if (maxDeposit > 0 && _balances[msg.sender] + amount > maxDeposit) {
            revert MaxDepositExceeded(_balances[msg.sender] + amount, maxDeposit);
        }
        _;
    }

    // ========= INTERNAL INTEREST =========
    function _applyInterest(address user) private returns (uint256) {
        uint256 balance = _balances[user];
        if (balance == 0) return 0;

        uint256 timePassed = block.timestamp - _lastInterestTimestamp[user];
        if (timePassed < 1 days) return 0;

        uint256 interest = (balance * interestRate * timePassed) / (365 days * 10000);

        if (interest > 0) {
            _balances[user] += interest;
            totalDeposits += interest;
            _lastInterestTimestamp[user] = block.timestamp;
            emit InterestClaimed(user, interest);
        }

        return interest;
    }

// ========= CORE LOGIC =========
//function _deposit(address user, uint256 amount) internal respectMaxDeposit(amount) {
//  if (amount == 0) revert ZeroDeposit();
//
//      _applyInterest(user);
//
//       balances[user] += amount;
//     totalDeposits += amount;
//   lastInterestTimestamp[user] = block.timestamp;
//
//      emit Deposit(user, amount);
//}

    // ========= USER FUNCTIONS =========
        
    function deposit() public payable whenNotPaused nonReentrant respectMaxDeposit(msg.value) {
        if (msg.value == 0) revert ZeroDeposit();
        if (minDeposit > 0 && msg.value < minDeposit) revert BelowMinDeposit(msg.value, minDeposit);
        _applyInterest(msg.sender);
        _balances[msg.sender] += msg.value;
        totalDeposits += msg.value;
        _lastInterestTimestamp[msg.sender] = block.timestamp;
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroWithdrawal();
        _applyInterest(msg.sender);
        uint256 balance = _balances[msg.sender];
        if (balance < amount) revert InsufficientBalance(amount, balance);
        _balances[msg.sender] -= amount;
        totalDeposits -= amount;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "ETH transfer failed");
        emit Withdrawal(msg.sender, amount);
    }

    function claimInterest() external whenNotPaused nonReentrant returns (uint256) {
        uint256 interest = _applyInterest(msg.sender);
        if (interest == 0) revert NoInterestYet();
        return interest;
    }

    // ========= VIEW FUNCTIONS =========
    function getBalance() external view returns (uint256) {
        return _balances[msg.sender];
    }

    function getBalanceOf(address user) external view returns (uint256) {
        return _balances[user];
    }

    function getBalanceWithInterest() external view returns (uint256) {
        uint256 balance = _balances[msg.sender];
        if (balance == 0) return 0;
        uint256 timePassed = block.timestamp - _lastInterestTimestamp[msg.sender];
        if (timePassed < 1 days) return balance;
        uint256 interest = (balance * interestRate * timePassed) / (365 days * 10000);
        return balance + interest;
    }
    function getPendingInterest(address user) external view returns (uint256) {
        uint256 balance = _balances[user];
        if (balance == 0) return 0;
        uint256 timePassed = block.timestamp - _lastInterestTimestamp[user];
        if (timePassed < 1 days) return 0;
        return (balance * interestRate * timePassed) / (365 days * 10000);
    }

    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function getLastInterestTime(address user) external view returns (uint256) {
        return _lastInterestTimestamp[user];
    }

    // ========= OWNER FUNCTIONS =========
    function setInterestRate(uint256 newRate) external onlyOwner {
        if (newRate > 500) revert RateTooHigh(newRate, 500);
        uint256 oldRate = interestRate;
        interestRate = newRate;
        emit InterestRateUpdated(oldRate, newRate);
    }

    function setMaxDeposit(uint256 newMax) external onlyOwner {
        uint256 oldMax = maxDeposit;
        maxDeposit = newMax;
        emit MaxDepositUpdated(oldMax, newMax);
    }

    function setMinDeposit(uint256 newMin) external onlyOwner {
        uint256 oldMin = minDeposit;
        minDeposit = newMin;
        emit MinDepositUpdated(oldMin, newMin);
    }
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function recoverETH(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient balance");
        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Transfer failed");
    }

    // ========= RECEIVE =========
    receive() external payable whenNotPaused {
        deposit();
    }
}