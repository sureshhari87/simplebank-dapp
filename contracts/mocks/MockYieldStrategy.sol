// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/ISimpleYieldStrategy.sol";

contract MockYieldStrategy is ISimpleYieldStrategy {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error CallerNotVault(address caller);
    error InsufficientStrategyAssets(uint256 requested, uint256 available);

    IERC20 public immutable assetToken;
    address public immutable vault;

    event MockDeposit(uint256 assets);
    event MockWithdrawal(address indexed receiver, uint256 assets);

    constructor(IERC20 initialAsset, address initialVault) {
        if (address(initialAsset) == address(0) || initialVault == address(0)) {
            revert ZeroAddress();
        }

        assetToken = initialAsset;
        vault = initialVault;
    }

    modifier onlyVault() {
        if (msg.sender != vault) revert CallerNotVault(msg.sender);
        _;
    }

    function asset() external view returns (address) {
        return address(assetToken);
    }

    function totalAssets() public view returns (uint256) {
        return assetToken.balanceOf(address(this));
    }

    function deposit(uint256 assets) external onlyVault {
        if (assets == 0) revert ZeroAmount();

        uint256 available = totalAssets();
        if (available < assets) revert InsufficientStrategyAssets(assets, available);

        emit MockDeposit(assets);
    }

    function withdraw(uint256 assets, address receiver) external onlyVault returns (uint256 received) {
        if (assets == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();

        uint256 available = totalAssets();
        if (assets > available) revert InsufficientStrategyAssets(assets, available);

        received = assets;
        assetToken.safeTransfer(receiver, received);
        emit MockWithdrawal(receiver, received);
    }

    function withdrawAll(address receiver) external onlyVault returns (uint256 received) {
        if (receiver == address(0)) revert ZeroAddress();

        received = totalAssets();
        if (received > 0) {
            assetToken.safeTransfer(receiver, received);
        }

        emit MockWithdrawal(receiver, received);
    }
}
