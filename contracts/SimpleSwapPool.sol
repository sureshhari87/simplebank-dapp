// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract SimpleSwapPool is ERC20, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error IdenticalTokens();
    error ZeroAmount();
    error FeeTooHigh(uint256 provided, uint256 maxAllowed);
    error InvalidToken(address token);
    error InsufficientLiquidity();
    error SlippageExceeded(uint256 actual, uint256 minimum);
    error InsufficientShares(uint256 requested, uint256 available);
    error NoProtocolFees();
    error RenounceOwnershipDisabled();

    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MAX_SWAP_FEE_BPS = 100;
    uint256 public constant MAX_PROTOCOL_FEE_SHARE_BPS = 5000;

    IERC20 public immutable token0;
    IERC20 public immutable token1;
    address public treasury;
    uint16 public swapFeeBps;
    uint16 public protocolFeeShareBps;
    uint256 public reserve0;
    uint256 public reserve1;
    uint256 public protocolFees0;
    uint256 public protocolFees1;

    event LiquidityAdded(
        address indexed provider,
        address indexed receiver,
        uint256 amount0,
        uint256 amount1,
        uint256 liquidity
    );
    event LiquidityRemoved(
        address indexed provider,
        address indexed receiver,
        uint256 amount0,
        uint256 amount1,
        uint256 liquidity
    );
    event Swapped(
        address indexed trader,
        address indexed receiver,
        address indexed tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 protocolFee
    );
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event SwapFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event ProtocolFeeShareUpdated(uint256 oldShareBps, uint256 newShareBps);
    event ProtocolFeesClaimed(address indexed treasury, uint256 amount0, uint256 amount1);
    event ReservesSynced(uint256 reserve0, uint256 reserve1);

    constructor(
        IERC20 initialToken0,
        IERC20 initialToken1,
        address initialOwner,
        address initialTreasury,
        uint256 initialSwapFeeBps,
        uint256 initialProtocolFeeShareBps
    ) ERC20("SimpleBank Swap LP", "sbSWAP-LP") {
        if (
            address(initialToken0) == address(0) ||
            address(initialToken1) == address(0) ||
            initialOwner == address(0) ||
            initialTreasury == address(0)
        ) {
            revert ZeroAddress();
        }
        if (address(initialToken0) == address(initialToken1)) revert IdenticalTokens();
        if (initialSwapFeeBps > MAX_SWAP_FEE_BPS) revert FeeTooHigh(initialSwapFeeBps, MAX_SWAP_FEE_BPS);
        if (initialProtocolFeeShareBps > MAX_PROTOCOL_FEE_SHARE_BPS) {
            revert FeeTooHigh(initialProtocolFeeShareBps, MAX_PROTOCOL_FEE_SHARE_BPS);
        }

        token0 = initialToken0;
        token1 = initialToken1;
        treasury = initialTreasury;
        swapFeeBps = uint16(initialSwapFeeBps);
        protocolFeeShareBps = uint16(initialProtocolFeeShareBps);
        _transferOwnership(initialOwner);
    }

    function token0Symbol() external view returns (string memory) {
        return IERC20Metadata(address(token0)).symbol();
    }

    function token1Symbol() external view returns (string memory) {
        return IERC20Metadata(address(token1)).symbol();
    }

    function token0Decimals() external view returns (uint8) {
        return IERC20Metadata(address(token0)).decimals();
    }

    function token1Decimals() external view returns (uint8) {
        return IERC20Metadata(address(token1)).decimals();
    }

    function getReserves() external view returns (uint256 currentReserve0, uint256 currentReserve1) {
        return (reserve0, reserve1);
    }

    function quoteAddLiquidity(uint256 amount0Desired, uint256 amount1Desired)
        public
        view
        returns (uint256 amount0, uint256 amount1, uint256 liquidity)
    {
        if (amount0Desired == 0 || amount1Desired == 0) revert ZeroAmount();

        uint256 supply = totalSupply();
        if (supply == 0) {
            amount0 = amount0Desired;
            amount1 = amount1Desired;
            liquidity = Math.sqrt(amount0 * amount1);
        } else {
            if (reserve0 == 0 || reserve1 == 0) revert InsufficientLiquidity();

            uint256 amount1Optimal = (amount0Desired * reserve1) / reserve0;
            if (amount1Optimal <= amount1Desired) {
                amount0 = amount0Desired;
                amount1 = amount1Optimal;
            } else {
                uint256 amount0Optimal = (amount1Desired * reserve0) / reserve1;
                amount0 = amount0Optimal;
                amount1 = amount1Desired;
            }

            liquidity = Math.min((amount0 * supply) / reserve0, (amount1 * supply) / reserve1);
        }

        if (liquidity == 0) revert ZeroAmount();
    }

    function addLiquidity(
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min,
        address receiver
    ) external whenNotPaused nonReentrant returns (uint256 amount0, uint256 amount1, uint256 liquidity) {
        if (receiver == address(0)) revert ZeroAddress();

        (amount0, amount1, liquidity) = quoteAddLiquidity(amount0Desired, amount1Desired);
        if (amount0 < amount0Min) revert SlippageExceeded(amount0, amount0Min);
        if (amount1 < amount1Min) revert SlippageExceeded(amount1, amount1Min);

        token0.safeTransferFrom(msg.sender, address(this), amount0);
        token1.safeTransferFrom(msg.sender, address(this), amount1);
        _mint(receiver, liquidity);
        _syncReserves();

        emit LiquidityAdded(msg.sender, receiver, amount0, amount1, liquidity);
    }

    function removeLiquidity(
        uint256 liquidity,
        uint256 amount0Min,
        uint256 amount1Min,
        address receiver
    ) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        if (receiver == address(0)) revert ZeroAddress();
        if (liquidity == 0) revert ZeroAmount();
        if (liquidity > balanceOf(msg.sender)) revert InsufficientShares(liquidity, balanceOf(msg.sender));

        uint256 supply = totalSupply();
        if (supply == 0 || reserve0 == 0 || reserve1 == 0) revert InsufficientLiquidity();

        amount0 = (liquidity * reserve0) / supply;
        amount1 = (liquidity * reserve1) / supply;
        if (amount0 < amount0Min) revert SlippageExceeded(amount0, amount0Min);
        if (amount1 < amount1Min) revert SlippageExceeded(amount1, amount1Min);
        if (amount0 == 0 || amount1 == 0) revert ZeroAmount();

        _burn(msg.sender, liquidity);
        reserve0 -= amount0;
        reserve1 -= amount1;
        token0.safeTransfer(receiver, amount0);
        token1.safeTransfer(receiver, amount1);

        emit LiquidityRemoved(msg.sender, receiver, amount0, amount1, liquidity);
    }

    function getAmountOut(address tokenIn, uint256 amountIn) public view returns (uint256 amountOut) {
        if (amountIn == 0) revert ZeroAmount();

        (uint256 reserveIn, uint256 reserveOut) = _reservesForTokenIn(tokenIn);
        if (reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity();

        uint256 feeAmount = (amountIn * swapFeeBps) / BASIS_POINTS;
        uint256 amountInForPricing = amountIn - feeAmount;
        amountOut = (reserveOut * amountInForPricing) / (reserveIn + amountInForPricing);
        if (amountOut == 0 || amountOut >= reserveOut) revert InsufficientLiquidity();
    }

    function swapExactTokensForTokens(
        address tokenIn,
        uint256 amountIn,
        uint256 minAmountOut,
        address receiver
    ) external whenNotPaused nonReentrant returns (uint256 amountOut) {
        if (receiver == address(0)) revert ZeroAddress();

        bool zeroForOne = _isToken0(tokenIn);
        if (!zeroForOne && !_isToken1(tokenIn)) revert InvalidToken(tokenIn);

        amountOut = getAmountOut(tokenIn, amountIn);
        if (amountOut < minAmountOut) revert SlippageExceeded(amountOut, minAmountOut);

        uint256 feeAmount = (amountIn * swapFeeBps) / BASIS_POINTS;
        uint256 protocolFee = (feeAmount * protocolFeeShareBps) / BASIS_POINTS;
        uint256 reserveInput = amountIn - protocolFee;

        if (zeroForOne) {
            protocolFees0 += protocolFee;
            reserve0 += reserveInput;
            reserve1 -= amountOut;
            token0.safeTransferFrom(msg.sender, address(this), amountIn);
            token1.safeTransfer(receiver, amountOut);
            emit Swapped(msg.sender, receiver, address(token0), address(token1), amountIn, amountOut, protocolFee);
        } else {
            protocolFees1 += protocolFee;
            reserve1 += reserveInput;
            reserve0 -= amountOut;
            token1.safeTransferFrom(msg.sender, address(this), amountIn);
            token0.safeTransfer(receiver, amountOut);
            emit Swapped(msg.sender, receiver, address(token1), address(token0), amountIn, amountOut, protocolFee);
        }
    }

    function sync() external nonReentrant {
        _syncReserves();
        emit ReservesSynced(reserve0, reserve1);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    function setSwapFeeBps(uint256 newSwapFeeBps) external onlyOwner {
        if (newSwapFeeBps > MAX_SWAP_FEE_BPS) revert FeeTooHigh(newSwapFeeBps, MAX_SWAP_FEE_BPS);
        uint256 oldFee = swapFeeBps;
        swapFeeBps = uint16(newSwapFeeBps);
        emit SwapFeeUpdated(oldFee, newSwapFeeBps);
    }

    function setProtocolFeeShareBps(uint256 newProtocolFeeShareBps) external onlyOwner {
        if (newProtocolFeeShareBps > MAX_PROTOCOL_FEE_SHARE_BPS) {
            revert FeeTooHigh(newProtocolFeeShareBps, MAX_PROTOCOL_FEE_SHARE_BPS);
        }
        uint256 oldShare = protocolFeeShareBps;
        protocolFeeShareBps = uint16(newProtocolFeeShareBps);
        emit ProtocolFeeShareUpdated(oldShare, newProtocolFeeShareBps);
    }

    function claimProtocolFees() external onlyOwner nonReentrant returns (uint256 amount0, uint256 amount1) {
        amount0 = protocolFees0;
        amount1 = protocolFees1;
        if (amount0 == 0 && amount1 == 0) revert NoProtocolFees();

        protocolFees0 = 0;
        protocolFees1 = 0;

        if (amount0 > 0) token0.safeTransfer(treasury, amount0);
        if (amount1 > 0) token1.safeTransfer(treasury, amount1);

        emit ProtocolFeesClaimed(treasury, amount0, amount1);
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

    function _isToken0(address token) private view returns (bool) {
        return token == address(token0);
    }

    function _isToken1(address token) private view returns (bool) {
        return token == address(token1);
    }

    function _reservesForTokenIn(address tokenIn) private view returns (uint256 reserveIn, uint256 reserveOut) {
        if (_isToken0(tokenIn)) return (reserve0, reserve1);
        if (_isToken1(tokenIn)) return (reserve1, reserve0);
        revert InvalidToken(tokenIn);
    }

    function _syncReserves() private {
        uint256 balance0 = token0.balanceOf(address(this));
        uint256 balance1 = token1.balanceOf(address(this));

        reserve0 = balance0 > protocolFees0 ? balance0 - protocolFees0 : 0;
        reserve1 = balance1 > protocolFees1 ? balance1 - protocolFees1 : 0;
    }
}
