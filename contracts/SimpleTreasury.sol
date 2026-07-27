// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SimpleTreasury is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct AssetPolicy {
        bool enabled;
        uint256 spendLimit;
        uint256 spent;
    }

    error ZeroAddress();
    error ZeroAmount();
    error InsufficientBalance(uint256 requested, uint256 available);
    error AssetNotEnabled(address asset);
    error SpendLimitExceeded(address asset, uint256 attempted, uint256 limit);
    error UnauthorizedOperator(address operator);
    error ETHTransferFailed();
    error ExternalCallFailed(bytes returndata);
    error RenounceOwnershipDisabled();

    address public constant ETH_ASSET = address(0);

    mapping(address => bool) public operators;
    mapping(address => AssetPolicy) public assetPolicies;
    mapping(address => bool) private knownAsset;
    address[] private trackedAssets;

    event ETHReceived(address indexed sender, uint256 amount);
    event OperatorUpdated(address indexed operator, bool allowed);
    event AssetPolicyUpdated(address indexed asset, bool enabled, uint256 spendLimit);
    event AssetSpendReset(address indexed asset, uint256 previousSpent);
    event ETHWithdrawn(address indexed recipient, uint256 amount);
    event TokenWithdrawn(address indexed token, address indexed recipient, uint256 amount);
    event ETHSpent(address indexed operator, address indexed recipient, uint256 amount);
    event TokenSpent(address indexed operator, address indexed token, address indexed recipient, uint256 amount);
    event ExternalCallExecuted(address indexed target, uint256 value, bytes data, bytes result);

    modifier onlyOperatorOrOwner() {
        if (msg.sender != owner() && !operators[msg.sender]) revert UnauthorizedOperator(msg.sender);
        _;
    }

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        _transferOwnership(initialOwner);
        _trackAsset(ETH_ASSET);
    }

    receive() external payable {
        emit ETHReceived(msg.sender, msg.value);
    }

    function trackedAssetCount() external view returns (uint256) {
        return trackedAssets.length;
    }

    function trackedAssetAt(uint256 index) external view returns (address) {
        return trackedAssets[index];
    }

    function getTrackedAssets() external view returns (address[] memory) {
        return trackedAssets;
    }

    function availableSpend(address asset) external view returns (uint256) {
        AssetPolicy memory policy = assetPolicies[asset];
        if (!policy.enabled || policy.spendLimit <= policy.spent) return 0;
        return policy.spendLimit - policy.spent;
    }

    function setOperator(address operator, bool allowed) external onlyOwner {
        if (operator == address(0)) revert ZeroAddress();
        operators[operator] = allowed;
        emit OperatorUpdated(operator, allowed);
    }

    function setAssetPolicy(address asset, bool enabled, uint256 spendLimit) external onlyOwner {
        assetPolicies[asset] = AssetPolicy({
            enabled: enabled,
            spendLimit: spendLimit,
            spent: assetPolicies[asset].spent
        });
        _trackAsset(asset);
        emit AssetPolicyUpdated(asset, enabled, spendLimit);
    }

    function resetAssetSpend(address asset) external onlyOwner {
        uint256 previousSpent = assetPolicies[asset].spent;
        assetPolicies[asset].spent = 0;
        emit AssetSpendReset(asset, previousSpent);
    }

    function withdrawETH(address payable recipient, uint256 amount) external onlyOwner whenNotPaused nonReentrant {
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 balance = address(this).balance;
        if (amount > balance) revert InsufficientBalance(amount, balance);

        _sendETH(recipient, amount);
        emit ETHWithdrawn(recipient, amount);
    }

    function withdrawToken(IERC20 token, address recipient, uint256 amount)
        external
        onlyOwner
        whenNotPaused
        nonReentrant
    {
        if (address(token) == address(0) || recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 balance = token.balanceOf(address(this));
        if (amount > balance) revert InsufficientBalance(amount, balance);

        _trackAsset(address(token));
        token.safeTransfer(recipient, amount);
        emit TokenWithdrawn(address(token), recipient, amount);
    }

    function spendETH(address payable recipient, uint256 amount)
        external
        onlyOperatorOrOwner
        whenNotPaused
        nonReentrant
    {
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 balance = address(this).balance;
        if (amount > balance) revert InsufficientBalance(amount, balance);

        _consumeSpend(ETH_ASSET, amount);
        _sendETH(recipient, amount);
        emit ETHSpent(msg.sender, recipient, amount);
    }

    function spendToken(IERC20 token, address recipient, uint256 amount)
        external
        onlyOperatorOrOwner
        whenNotPaused
        nonReentrant
    {
        if (address(token) == address(0) || recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 balance = token.balanceOf(address(this));
        if (amount > balance) revert InsufficientBalance(amount, balance);

        _consumeSpend(address(token), amount);
        token.safeTransfer(recipient, amount);
        emit TokenSpent(msg.sender, address(token), recipient, amount);
    }

    function execute(address target, uint256 value, bytes calldata data)
        external
        onlyOwner
        whenNotPaused
        nonReentrant
        returns (bytes memory result)
    {
        if (target == address(0)) revert ZeroAddress();
        uint256 balance = address(this).balance;
        if (value > balance) revert InsufficientBalance(value, balance);

        bool success;
        (success, result) = target.call{value: value}(data);
        if (!success) revert ExternalCallFailed(result);

        emit ExternalCallExecuted(target, value, data, result);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function renounceOwnership() public view override onlyOwner {
        revert RenounceOwnershipDisabled();
    }

    function _consumeSpend(address asset, uint256 amount) private {
        AssetPolicy storage policy = assetPolicies[asset];
        if (!policy.enabled) revert AssetNotEnabled(asset);

        uint256 attempted = policy.spent + amount;
        if (attempted > policy.spendLimit) revert SpendLimitExceeded(asset, attempted, policy.spendLimit);

        policy.spent = attempted;
        _trackAsset(asset);
    }

    function _sendETH(address payable recipient, uint256 amount) private {
        (bool success, ) = recipient.call{value: amount}("");
        if (!success) revert ETHTransferFailed();
    }

    function _trackAsset(address asset) private {
        if (knownAsset[asset]) return;
        knownAsset[asset] = true;
        trackedAssets.push(asset);
    }
}
