// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}

contract SimpleWETHYieldVault is ERC4626, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error FeeTooHigh(uint256 provided, uint256 maxAllowed);
    error MaxTotalAssetsExceeded(uint256 attempted, uint256 maxAllowed);
    error MaxWithdrawExceeded(uint256 requested, uint256 maxAllowed);
    error MaxRedeemExceeded(uint256 requested, uint256 maxAllowed);
    error ETHTransferFailed();
    error DirectETHUnsupported();
    error RenounceOwnershipDisabled();

    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MAX_PERFORMANCE_FEE_BPS = 2000;

    IWETH public immutable weth;
    address public treasury;
    uint16 public performanceFeeBps;
    uint256 public maxTotalAssets;
    uint256 public accountedAssets;

    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event PerformanceFeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    event MaxTotalAssetsUpdated(uint256 oldMaxTotalAssets, uint256 newMaxTotalAssets);
    event PerformanceFeeAccrued(address indexed treasury, uint256 feeAssets, uint256 feeShares);
    event YieldDonated(address indexed donor, uint256 assets);

    constructor(
        IWETH initialWeth,
        address initialOwner,
        address initialTreasury,
        uint256 initialPerformanceFeeBps,
        uint256 initialMaxTotalAssets
    )
        ERC20("SimpleBank WETH Yield Vault", "sbWETH")
        ERC4626(IERC20(address(initialWeth)))
    {
        if (address(initialWeth) == address(0) || initialOwner == address(0) || initialTreasury == address(0)) {
            revert ZeroAddress();
        }
        if (initialPerformanceFeeBps > MAX_PERFORMANCE_FEE_BPS) {
            revert FeeTooHigh(initialPerformanceFeeBps, MAX_PERFORMANCE_FEE_BPS);
        }

        weth = initialWeth;
        treasury = initialTreasury;
        performanceFeeBps = uint16(initialPerformanceFeeBps);
        maxTotalAssets = initialMaxTotalAssets;
        _transferOwnership(initialOwner);
    }

    function maxDeposit(address receiver) public view override returns (uint256) {
        if (paused()) return 0;

        uint256 vaultCap = maxTotalAssets;
        if (vaultCap == 0) return super.maxDeposit(receiver);

        uint256 currentAssets = totalAssets();
        if (currentAssets >= vaultCap) return 0;
        return vaultCap - currentAssets;
    }

    function maxMint(address receiver) public view override returns (uint256) {
        uint256 maxAssets = maxDeposit(receiver);
        if (maxAssets == type(uint256).max) return super.maxMint(receiver);
        return convertToShares(maxAssets);
    }

    function deposit(uint256 assets, address receiver)
        public
        override
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        if (assets == 0) revert ZeroAmount();
        _accruePerformanceFee();
        if (assets > maxDeposit(receiver)) {
            revert MaxTotalAssetsExceeded(totalAssets() + assets, maxTotalAssets);
        }

        uint256 shares = super.deposit(assets, receiver);
        _syncAccountedAssets();
        return shares;
    }

    function mint(uint256 shares, address receiver)
        public
        override
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        if (shares == 0) revert ZeroAmount();
        _accruePerformanceFee();
        uint256 assetsPreview = previewMint(shares);
        if (assetsPreview > maxDeposit(receiver)) {
            revert MaxTotalAssetsExceeded(totalAssets() + assetsPreview, maxTotalAssets);
        }

        uint256 assets = super.mint(shares, receiver);
        _syncAccountedAssets();
        return assets;
    }

    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        if (assets == 0) revert ZeroAmount();
        _accruePerformanceFee();
        uint256 shares = super.withdraw(assets, receiver, owner);
        _syncAccountedAssets();
        return shares;
    }

    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        if (shares == 0) revert ZeroAmount();
        _accruePerformanceFee();
        uint256 assets = super.redeem(shares, receiver, owner);
        _syncAccountedAssets();
        return assets;
    }

    function depositETH(address receiver) external payable whenNotPaused nonReentrant returns (uint256) {
        if (msg.value == 0) revert ZeroAmount();

        _accruePerformanceFee();
        if (msg.value > maxDeposit(receiver)) {
            revert MaxTotalAssetsExceeded(totalAssets() + msg.value, maxTotalAssets);
        }

        uint256 shares = previewDeposit(msg.value);
        weth.deposit{value: msg.value}();
        _mint(receiver, shares);
        _syncAccountedAssets();

        emit Deposit(msg.sender, receiver, msg.value, shares);
        return shares;
    }

    function withdrawETH(uint256 assets, address payable receiver, address owner)
        external
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        if (assets == 0) revert ZeroAmount();

        _accruePerformanceFee();
        uint256 maxAssets = maxWithdraw(owner);
        if (assets > maxAssets) revert MaxWithdrawExceeded(assets, maxAssets);

        uint256 shares = previewWithdraw(assets);
        if (msg.sender != owner) {
            _spendAllowance(owner, msg.sender, shares);
        }

        _burn(owner, shares);
        accountedAssets = totalAssets() - assets;
        weth.withdraw(assets);

        emit Withdraw(msg.sender, receiver, owner, assets, shares);
        _sendETH(receiver, assets);
        return shares;
    }

    function redeemETH(uint256 shares, address payable receiver, address owner)
        external
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        if (shares == 0) revert ZeroAmount();

        _accruePerformanceFee();
        uint256 maxShares = maxRedeem(owner);
        if (shares > maxShares) revert MaxRedeemExceeded(shares, maxShares);

        uint256 assets = previewRedeem(shares);
        if (msg.sender != owner) {
            _spendAllowance(owner, msg.sender, shares);
        }

        _burn(owner, shares);
        accountedAssets = totalAssets() - assets;
        weth.withdraw(assets);

        emit Withdraw(msg.sender, receiver, owner, assets, shares);
        _sendETH(receiver, assets);
        return assets;
    }

    function donateYield(uint256 assets) external whenNotPaused nonReentrant {
        if (assets == 0) revert ZeroAmount();
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), assets);
        emit YieldDonated(msg.sender, assets);
    }

    function donateYieldETH() external payable whenNotPaused nonReentrant {
        if (msg.value == 0) revert ZeroAmount();
        weth.deposit{value: msg.value}();
        emit YieldDonated(msg.sender, msg.value);
    }

    function harvestPerformanceFee() external whenNotPaused nonReentrant returns (uint256 feeAssets, uint256 feeShares) {
        (feeAssets, feeShares) = _accruePerformanceFee();
        _syncAccountedAssets();
    }

    function setTreasury(address newTreasury) external onlyOwner nonReentrant {
        if (newTreasury == address(0)) revert ZeroAddress();
        _accruePerformanceFee();

        address oldTreasury = treasury;
        treasury = newTreasury;
        _syncAccountedAssets();
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    function setPerformanceFeeBps(uint256 newFeeBps) external onlyOwner nonReentrant {
        if (newFeeBps > MAX_PERFORMANCE_FEE_BPS) {
            revert FeeTooHigh(newFeeBps, MAX_PERFORMANCE_FEE_BPS);
        }

        _accruePerformanceFee();
        uint256 oldFeeBps = performanceFeeBps;
        performanceFeeBps = uint16(newFeeBps);
        _syncAccountedAssets();
        emit PerformanceFeeUpdated(oldFeeBps, newFeeBps);
    }

    function setMaxTotalAssets(uint256 newMaxTotalAssets) external onlyOwner {
        uint256 oldMaxTotalAssets = maxTotalAssets;
        maxTotalAssets = newMaxTotalAssets;
        emit MaxTotalAssetsUpdated(oldMaxTotalAssets, newMaxTotalAssets);
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

    function _accruePerformanceFee() private returns (uint256 feeAssets, uint256 feeShares) {
        uint256 currentAssets = totalAssets();
        uint256 lastAccountedAssets = accountedAssets;
        if (currentAssets <= lastAccountedAssets) {
            accountedAssets = currentAssets;
            return (0, 0);
        }

        uint256 supply = totalSupply();
        if (supply == 0 || performanceFeeBps == 0) {
            accountedAssets = currentAssets;
            return (0, 0);
        }

        uint256 gain = currentAssets - lastAccountedAssets;
        feeAssets = (gain * performanceFeeBps) / BASIS_POINTS;
        if (feeAssets == 0) {
            accountedAssets = currentAssets;
            return (0, 0);
        }

        uint256 assetsAfterFee = currentAssets - feeAssets;
        feeShares = (feeAssets * supply) / assetsAfterFee;
        if (feeShares > 0) {
            _mint(treasury, feeShares);
            emit PerformanceFeeAccrued(treasury, feeAssets, feeShares);
        }

        accountedAssets = currentAssets;
    }

    function _syncAccountedAssets() private {
        accountedAssets = totalAssets();
    }

    function _sendETH(address payable receiver, uint256 amount) private {
        (bool success, ) = receiver.call{value: amount}("");
        if (!success) revert ETHTransferFailed();
    }

    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    receive() external payable {
        if (msg.sender != address(weth)) revert DirectETHUnsupported();
    }
}
