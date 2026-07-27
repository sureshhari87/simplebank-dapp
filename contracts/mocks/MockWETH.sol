// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockWETH is ERC20 {
    error ZeroAmount();
    error ETHTransferFailed();

    constructor() ERC20("Wrapped Ether", "WETH") {}

    function deposit() public payable {
        if (msg.value == 0) revert ZeroAmount();
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        _burn(msg.sender, amount);

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert ETHTransferFailed();
    }

    receive() external payable {
        deposit();
    }
}
