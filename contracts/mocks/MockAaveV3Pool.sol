// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./MockAToken.sol";

contract MockAaveV3Pool {
    using SafeERC20 for IERC20;

    error AssetMismatch(address expected, address actual);
    error ZeroAddress();
    error ZeroAmount();

    IERC20 public immutable assetToken;
    MockAToken public immutable aToken;

    constructor(IERC20 initialAsset, MockAToken initialAToken) {
        if (address(initialAsset) == address(0) || address(initialAToken) == address(0)) {
            revert ZeroAddress();
        }

        assetToken = initialAsset;
        aToken = initialAToken;
    }

    function supply(address asset, uint256 amount, address onBehalfOf, uint16) external {
        if (asset != address(assetToken)) revert AssetMismatch(address(assetToken), asset);
        if (amount == 0) revert ZeroAmount();
        if (onBehalfOf == address(0)) revert ZeroAddress();

        assetToken.safeTransferFrom(msg.sender, address(this), amount);
        aToken.mint(onBehalfOf, amount);
    }

    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        if (asset != address(assetToken)) revert AssetMismatch(address(assetToken), asset);
        if (to == address(0)) revert ZeroAddress();

        uint256 available = aToken.balanceOf(msg.sender);
        uint256 received = amount == type(uint256).max ? available : amount;
        if (received == 0) return 0;

        aToken.burn(msg.sender, received);
        assetToken.safeTransfer(to, received);
        return received;
    }

    function accrueYield(address account, uint256 amount) external {
        if (account == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        assetToken.safeTransferFrom(msg.sender, address(this), amount);
        aToken.mint(account, amount);
    }
}
