// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/ISimpleYieldStrategy.sol";

contract SimpleStrategyManager is ISimpleYieldStrategy, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct StrategyConfig {
        bool approved;
        uint256 maxAssets;
    }

    error ZeroAddress();
    error ZeroAmount();
    error CallerNotVault(address caller);
    error StrategyAlreadyApproved(address strategy);
    error StrategyNotApproved(address strategy);
    error StrategyAssetMismatch(address expected, address actual);
    error StrategyHasAssets(address strategy, uint256 assets);
    error TooManyStrategies(uint256 attempted, uint256 maxAllowed);
    error MaxStrategyAssetsExceeded(address strategy, uint256 attempted, uint256 maxAllowed);
    error InsufficientIdleAssets(uint256 requested, uint256 available);
    error StrategyWithdrawShortfall(address strategy, uint256 requested, uint256 received);
    error ProtectedToken(address token);
    error RenounceOwnershipDisabled();

    uint256 public constant MAX_STRATEGIES = 20;

    IERC20 public immutable assetToken;
    address public immutable vault;
    ISimpleYieldStrategy public defaultStrategy;

    ISimpleYieldStrategy[] private strategies;
    mapping(address => StrategyConfig) public strategyConfigs;
    mapping(address => uint256) private strategyIndexPlusOne;

    event StrategyAdded(address indexed strategy, uint256 maxAssets, bool defaultStrategy);
    event StrategyRemoved(address indexed strategy);
    event StrategyCapUpdated(address indexed strategy, uint256 oldMaxAssets, uint256 newMaxAssets);
    event DefaultStrategyUpdated(address indexed oldStrategy, address indexed newStrategy);
    event ManagerDeposit(uint256 assets, uint256 investedAssets, uint256 idleAssets);
    event ManagerWithdrawal(address indexed receiver, uint256 assets);
    event StrategyInvested(address indexed strategy, uint256 assets);
    event StrategyDivested(address indexed strategy, uint256 requestedAssets, uint256 receivedAssets);
    event StrategyRebalanced(address indexed fromStrategy, address indexed toStrategy, uint256 requestedAssets, uint256 movedAssets);
    event TokenRescued(address indexed token, address indexed receiver, uint256 amount);

    constructor(IERC20 initialAsset, address initialVault, address initialOwner) {
        if (address(initialAsset) == address(0) || initialVault == address(0) || initialOwner == address(0)) {
            revert ZeroAddress();
        }

        assetToken = initialAsset;
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

    function idleAssets() public view returns (uint256) {
        return assetToken.balanceOf(address(this));
    }

    function strategyCount() external view returns (uint256) {
        return strategies.length;
    }

    function strategyAt(uint256 index) external view returns (address) {
        return address(strategies[index]);
    }

    function getStrategies() external view returns (address[] memory strategyAddresses) {
        uint256 length = strategies.length;
        strategyAddresses = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            strategyAddresses[i] = address(strategies[i]);
        }
    }

    function isKnownStrategy(address strategy) public view returns (bool) {
        return strategyIndexPlusOne[strategy] != 0;
    }

    function isApprovedStrategy(address strategy) public view returns (bool) {
        return strategyConfigs[strategy].approved;
    }

    function strategyAssets(address strategy) public view returns (uint256) {
        if (!isKnownStrategy(strategy)) return 0;
        return ISimpleYieldStrategy(strategy).totalAssets();
    }

    function availableStrategyCapacity(address strategy) public view returns (uint256) {
        StrategyConfig memory config = strategyConfigs[strategy];
        if (!config.approved) return 0;
        if (config.maxAssets == 0) return type(uint256).max;

        uint256 currentAssets = ISimpleYieldStrategy(strategy).totalAssets();
        if (currentAssets >= config.maxAssets) return 0;
        return config.maxAssets - currentAssets;
    }

    function totalStrategyAssets() public view returns (uint256 assets) {
        uint256 length = strategies.length;
        for (uint256 i = 0; i < length; i++) {
            assets += strategies[i].totalAssets();
        }
    }

    function totalAssets() public view returns (uint256) {
        return idleAssets() + totalStrategyAssets();
    }

    function deposit(uint256 assets) external onlyVault nonReentrant {
        if (assets == 0) revert ZeroAmount();

        uint256 available = idleAssets();
        if (available < assets) revert InsufficientIdleAssets(assets, available);

        uint256 investedAssets = 0;
        ISimpleYieldStrategy currentDefault = defaultStrategy;
        if (address(currentDefault) != address(0)) {
            investedAssets = _boundedInvest(currentDefault, assets);
        }

        emit ManagerDeposit(assets, investedAssets, idleAssets());
    }

    function withdraw(uint256 assets, address receiver) external onlyVault nonReentrant returns (uint256 received) {
        if (assets == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();

        _ensureIdleAssets(assets);
        assetToken.safeTransfer(receiver, assets);
        received = assets;

        emit ManagerWithdrawal(receiver, assets);
    }

    function withdrawAll(address receiver) external onlyVault nonReentrant returns (uint256 received) {
        if (receiver == address(0)) revert ZeroAddress();

        for (uint256 i = 0; i < strategies.length; i++) {
            uint256 assets = strategies[i].totalAssets();
            if (assets > 0) {
                _withdrawAllFromStrategy(strategies[i]);
            }
        }

        received = idleAssets();
        if (received > 0) {
            assetToken.safeTransfer(receiver, received);
        }

        emit ManagerWithdrawal(receiver, received);
    }

    function addStrategy(ISimpleYieldStrategy newStrategy, uint256 maxAssets, bool makeDefault)
        external
        onlyOwner
        nonReentrant
    {
        _validateStrategy(newStrategy);

        address strategyAddress = address(newStrategy);
        if (strategyConfigs[strategyAddress].approved) {
            revert StrategyAlreadyApproved(strategyAddress);
        }

        if (!isKnownStrategy(strategyAddress)) {
            uint256 attempted = strategies.length + 1;
            if (attempted > MAX_STRATEGIES) revert TooManyStrategies(attempted, MAX_STRATEGIES);
            strategies.push(newStrategy);
            strategyIndexPlusOne[strategyAddress] = strategies.length;
        }

        strategyConfigs[strategyAddress] = StrategyConfig({
            approved: true,
            maxAssets: maxAssets
        });

        emit StrategyAdded(strategyAddress, maxAssets, makeDefault);

        if (makeDefault) {
            _setDefaultStrategy(newStrategy);
        }
    }

    function removeStrategy(ISimpleYieldStrategy strategyToRemove) external onlyOwner nonReentrant {
        address strategyAddress = address(strategyToRemove);
        if (!strategyConfigs[strategyAddress].approved) revert StrategyNotApproved(strategyAddress);

        uint256 assets = strategyToRemove.totalAssets();
        if (assets != 0) revert StrategyHasAssets(strategyAddress, assets);

        strategyConfigs[strategyAddress] = StrategyConfig({
            approved: false,
            maxAssets: 0
        });

        if (address(defaultStrategy) == strategyAddress) {
            _setDefaultStrategy(ISimpleYieldStrategy(address(0)));
        }

        emit StrategyRemoved(strategyAddress);
    }

    function setStrategyCap(ISimpleYieldStrategy strategyToUpdate, uint256 newMaxAssets) external onlyOwner {
        address strategyAddress = address(strategyToUpdate);
        StrategyConfig storage config = strategyConfigs[strategyAddress];
        if (!config.approved) revert StrategyNotApproved(strategyAddress);

        uint256 oldMaxAssets = config.maxAssets;
        config.maxAssets = newMaxAssets;
        emit StrategyCapUpdated(strategyAddress, oldMaxAssets, newMaxAssets);
    }

    function setDefaultStrategy(ISimpleYieldStrategy newDefaultStrategy) external onlyOwner {
        if (address(newDefaultStrategy) != address(0) && !strategyConfigs[address(newDefaultStrategy)].approved) {
            revert StrategyNotApproved(address(newDefaultStrategy));
        }

        _setDefaultStrategy(newDefaultStrategy);
    }

    function invest(ISimpleYieldStrategy strategyToInvest, uint256 assets) external onlyOwner nonReentrant {
        if (assets == 0) revert ZeroAmount();
        _requireApprovedStrategy(strategyToInvest);

        uint256 idle = idleAssets();
        if (assets > idle) revert InsufficientIdleAssets(assets, idle);

        _investToStrategy(strategyToInvest, assets);
    }

    function divest(ISimpleYieldStrategy strategyToDivest, uint256 assets)
        external
        onlyOwner
        nonReentrant
        returns (uint256 received)
    {
        if (assets == 0) revert ZeroAmount();
        _requireKnownStrategy(strategyToDivest);

        received = _withdrawFromStrategy(strategyToDivest, assets);
    }

    function divestAll(ISimpleYieldStrategy strategyToDivest)
        external
        onlyOwner
        nonReentrant
        returns (uint256 received)
    {
        _requireKnownStrategy(strategyToDivest);
        received = _withdrawAllFromStrategy(strategyToDivest);
    }

    function rebalance(ISimpleYieldStrategy fromStrategy, ISimpleYieldStrategy toStrategy, uint256 assets)
        external
        onlyOwner
        nonReentrant
        returns (uint256 movedAssets)
    {
        if (assets == 0) revert ZeroAmount();
        _requireKnownStrategy(fromStrategy);
        _requireApprovedStrategy(toStrategy);

        movedAssets = _withdrawFromStrategy(fromStrategy, assets);
        _investToStrategy(toStrategy, movedAssets);

        emit StrategyRebalanced(address(fromStrategy), address(toStrategy), assets, movedAssets);
    }

    function rescueToken(IERC20 token, address receiver, uint256 amount) external onlyOwner {
        if (address(token) == address(0) || receiver == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (address(token) == address(assetToken)) revert ProtectedToken(address(token));

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

    function _validateStrategy(ISimpleYieldStrategy strategyToValidate) private view {
        if (address(strategyToValidate) == address(0)) revert ZeroAddress();

        address strategyAsset = strategyToValidate.asset();
        if (strategyAsset != address(assetToken)) {
            revert StrategyAssetMismatch(address(assetToken), strategyAsset);
        }
    }

    function _setDefaultStrategy(ISimpleYieldStrategy newDefaultStrategy) private {
        address oldStrategy = address(defaultStrategy);
        defaultStrategy = newDefaultStrategy;
        emit DefaultStrategyUpdated(oldStrategy, address(newDefaultStrategy));
    }

    function _boundedInvest(ISimpleYieldStrategy strategyToInvest, uint256 assets)
        private
        returns (uint256 investedAssets)
    {
        uint256 capacity = availableStrategyCapacity(address(strategyToInvest));
        if (capacity == 0) return 0;

        investedAssets = assets < capacity ? assets : capacity;
        if (investedAssets > 0) {
            _investToStrategy(strategyToInvest, investedAssets);
        }
    }

    function _investToStrategy(ISimpleYieldStrategy strategyToInvest, uint256 assets) private {
        address strategyAddress = address(strategyToInvest);
        StrategyConfig memory config = strategyConfigs[strategyAddress];
        if (!config.approved) revert StrategyNotApproved(strategyAddress);

        if (config.maxAssets != 0) {
            uint256 attempted = strategyToInvest.totalAssets() + assets;
            if (attempted > config.maxAssets) {
                revert MaxStrategyAssetsExceeded(strategyAddress, attempted, config.maxAssets);
            }
        }

        assetToken.safeTransfer(strategyAddress, assets);
        strategyToInvest.deposit(assets);

        emit StrategyInvested(strategyAddress, assets);
    }

    function _ensureIdleAssets(uint256 assets) private {
        uint256 idle = idleAssets();
        if (idle >= assets) return;

        uint256 remaining = assets - idle;
        uint256 length = strategies.length;
        for (uint256 i = 0; i < length && remaining > 0; i++) {
            uint256 available = strategies[i].totalAssets();
            if (available == 0) continue;

            uint256 requested = available < remaining ? available : remaining;
            uint256 received = _withdrawFromStrategy(strategies[i], requested);
            remaining = received >= remaining ? 0 : remaining - received;
        }

        uint256 updatedIdle = idleAssets();
        if (updatedIdle < assets) {
            revert InsufficientIdleAssets(assets, updatedIdle);
        }
    }

    function _withdrawFromStrategy(ISimpleYieldStrategy strategyToDivest, uint256 assets)
        private
        returns (uint256 received)
    {
        address strategyAddress = address(strategyToDivest);
        uint256 idleBefore = idleAssets();
        uint256 reportedReceived = strategyToDivest.withdraw(assets, address(this));
        uint256 idleAfter = idleAssets();
        received = idleAfter - idleBefore;

        if (received < assets || reportedReceived < assets) {
            revert StrategyWithdrawShortfall(strategyAddress, assets, received);
        }

        emit StrategyDivested(strategyAddress, assets, received);
    }

    function _withdrawAllFromStrategy(ISimpleYieldStrategy strategyToDivest)
        private
        returns (uint256 received)
    {
        address strategyAddress = address(strategyToDivest);
        uint256 idleBefore = idleAssets();
        uint256 requestedAssets = strategyToDivest.totalAssets();
        uint256 reportedReceived = strategyToDivest.withdrawAll(address(this));
        received = idleAssets() - idleBefore;
        if (received < reportedReceived) {
            revert StrategyWithdrawShortfall(strategyAddress, reportedReceived, received);
        }

        emit StrategyDivested(strategyAddress, requestedAssets, received);
    }

    function _requireKnownStrategy(ISimpleYieldStrategy strategyToCheck) private view {
        if (!isKnownStrategy(address(strategyToCheck))) revert StrategyNotApproved(address(strategyToCheck));
    }

    function _requireApprovedStrategy(ISimpleYieldStrategy strategyToCheck) private view {
        if (!strategyConfigs[address(strategyToCheck)].approved) revert StrategyNotApproved(address(strategyToCheck));
    }
}
