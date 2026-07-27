// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockAToken is ERC20 {
    error ZeroAddress();
    error PoolAlreadySet();
    error CallerNotPool(address caller);

    address public pool;

    constructor() ERC20("Mock Aave WETH", "maWETH") {}

    modifier onlyPool() {
        if (msg.sender != pool) revert CallerNotPool(msg.sender);
        _;
    }

    function setPool(address newPool) external {
        if (newPool == address(0)) revert ZeroAddress();
        if (pool != address(0)) revert PoolAlreadySet();

        pool = newPool;
    }

    function mint(address account, uint256 amount) external onlyPool {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external onlyPool {
        _burn(account, amount);
    }
}
