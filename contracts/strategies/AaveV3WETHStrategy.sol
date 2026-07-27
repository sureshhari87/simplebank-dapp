// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/ISimpleYieldStrategy.sol";

interface IAaveV3Pool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;

    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

contract AaveV3WETHStrategy is ISimpleYieldStrategy, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error CallerNotVault(address caller);
    error InsufficientStrategyAssets(uint256 requested, uint256 available);
    error ProtectedToken(address token);
    error RenounceOwnershipDisabled();

    IERC20 public immutable assetToken;
    IERC20 public immutable aToken;
    IAaveV3Pool public immutable pool;
    address public immutable vault;

    event StrategyDeposit(uint256 assets);
    event StrategyWithdrawal(address indexed receiver, uint256 assets);
    event TokenRescued(address indexed token, address indexed receiver, uint256 amount);

    constructor(
        IERC20 initialAsset,
        IERC20 initialAToken,
        IAaveV3Pool initialPool,
        address initialVault,
        address initialOwner
    ) {
        if (
            address(initialAsset) == address(0) ||
            address(initialAToken) == address(0) ||
            address(initialPool) == address(0) ||
            initialVault == address(0) ||
            initialOwner == address(0)
        ) {
            revert ZeroAddress();
        }

        assetToken = initialAsset;
        aToken = initialAToken;
        pool = initialPool;
        vault = initialVault;
        _transferOwnership(initialOwner);
    }

    modifier onlyVault() {
        if (msg.sender != vault) revert CallerNotVault(msg.sender);
        _;
    }

    function asset() external view returns (address) {
        return address(assetToken);
    }

    function totalAssets() public view returns (uint256) {
        return aToken.balanceOf(address(this));
    }

    function deposit(uint256 assets) external onlyVault nonReentrant {
        if (assets == 0) revert ZeroAmount();

        uint256 available = assetToken.balanceOf(address(this));
        if (available < assets) revert InsufficientStrategyAssets(assets, available);

        assetToken.safeIncreaseAllowance(address(pool), assets);
        pool.supply(address(assetToken), assets, address(this), 0);

        emit StrategyDeposit(assets);
    }

    function withdraw(uint256 assets, address receiver) external onlyVault nonReentrant returns (uint256 received) {
        if (assets == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();

        uint256 available = totalAssets();
        if (assets > available) revert InsufficientStrategyAssets(assets, available);

        received = pool.withdraw(address(assetToken), assets, address(this));
        assetToken.safeTransfer(receiver, received);

        emit StrategyWithdrawal(receiver, received);
    }

    function withdrawAll(address receiver) external onlyVault nonReentrant returns (uint256 received) {
        if (receiver == address(0)) revert ZeroAddress();

        uint256 available = totalAssets();
        if (available == 0) return 0;

        received = pool.withdraw(address(assetToken), type(uint256).max, address(this));
        assetToken.safeTransfer(receiver, received);

        emit StrategyWithdrawal(receiver, received);
    }

    function rescueToken(IERC20 token, address receiver, uint256 amount) external onlyOwner {
        if (address(token) == address(0) || receiver == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (address(token) == address(assetToken) || address(token) == address(aToken)) {
            revert ProtectedToken(address(token));
        }

        token.safeTransfer(receiver, amount);
        emit TokenRescued(address(token), receiver, amount);
    }

    function transferOwnership(address newOwner) public override onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        super.transferOwnership(newOwner);
    }

    function renounceOwnership() public view override onlyOwner {
        revert RenounceOwnershipDisabled();
    }
}
