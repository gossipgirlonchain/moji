// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal ERC-20 surface used by the escrow.
interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

/**
 * @title MojiDrops
 * @notice Escrow for creator drops on moji.wtf.
 *
 * A creator funds a campaign once: the full amount of an ERC-20 (the moji token or the paired stock
 * token) is pulled into this contract and locked. The creator cannot take it back while the campaign
 * runs. The moji operator pays rounds from it (recipients and amounts are computed off-chain from the
 * holder rules the creator signed), and can never pay out more than the campaign holds. When the
 * campaign is over the operator ends it and any remainder goes back to the creator. If the operator
 * ever goes quiet, the creator can reclaim the remainder themselves once `reclaimAfter` has passed.
 *
 * Per-recipient transfers are wrapped so one blocked recipient (stock tokens carry a blocklist) does
 * not revert the whole round; that amount simply stays in the campaign.
 */
contract MojiDrops {
    struct Campaign {
        address creator;
        address token;
        uint128 amount;   // funded
        uint128 paid;     // paid out so far
        uint64 reclaimAfter;
        bool ended;
        bytes32 key;      // off-chain campaign id (uuid packed), for indexing
    }

    address public owner;
    address public operator;
    uint256 public nextId = 1;
    mapping(uint256 => Campaign) public campaigns;

    event OperatorSet(address indexed operator);
    event CampaignFunded(uint256 indexed id, address indexed creator, address indexed token, uint256 amount, uint64 reclaimAfter, bytes32 key);
    event RoundPaid(uint256 indexed id, uint256 total, uint256 recipients, uint256 skipped);
    event CampaignEnded(uint256 indexed id, uint256 returned);

    error NotOwner();
    error NotOperator();
    error NotCreator();
    error Ended();
    error LengthMismatch();
    error Overspend();
    error TooEarly();
    error ZeroAmount();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator && msg.sender != owner) revert NotOperator();
        _;
    }

    constructor(address _operator) {
        owner = msg.sender;
        operator = _operator;
        emit OperatorSet(_operator);
    }

    function setOperator(address _operator) external onlyOwner {
        operator = _operator;
        emit OperatorSet(_operator);
    }

    function transferOwnership(address _owner) external onlyOwner {
        owner = _owner;
    }

    /**
     * @notice Fund a campaign. Pulls `amount` of `token` from the caller (approve first).
     * @param reclaimAfter unix time after which the creator may reclaim the remainder without the operator.
     *        The app sets it to campaign end + 7 days.
     * @param key off-chain campaign id so the server can match the receipt to its row.
     */
    function fund(address token, uint256 amount, uint64 reclaimAfter, bytes32 key) external returns (uint256 id) {
        if (amount == 0 || amount > type(uint128).max) revert ZeroAmount();
        id = nextId++;
        // Measure what actually arrived so fee-on-transfer tokens cannot overstate the campaign.
        uint256 before = IERC20(token).balanceOf(address(this));
        if (!IERC20(token).transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        uint256 received = IERC20(token).balanceOf(address(this)) - before;
        if (received == 0 || received > type(uint128).max) revert ZeroAmount();
        campaigns[id] = Campaign({ creator: msg.sender, token: token, amount: uint128(received), paid: 0, reclaimAfter: reclaimAfter, ended: false, key: key });
        emit CampaignFunded(id, msg.sender, token, received, reclaimAfter, key);
    }

    /// @notice Pay one round. Never exceeds what the campaign still holds. Blocked recipients are skipped.
    function payRound(uint256 id, address[] calldata recipients, uint256[] calldata amounts) external onlyOperator returns (uint256 total, uint256 skipped) {
        if (recipients.length != amounts.length) revert LengthMismatch();
        Campaign storage c = campaigns[id];
        if (c.ended) revert Ended();
        uint256 sum;
        for (uint256 i = 0; i < amounts.length; i++) sum += amounts[i];
        if (sum > uint256(c.amount) - uint256(c.paid)) revert Overspend();
        IERC20 token = IERC20(c.token);
        for (uint256 i = 0; i < recipients.length; i++) {
            (bool ok, bytes memory ret) = address(token).call(abi.encodeWithSelector(IERC20.transfer.selector, recipients[i], amounts[i]));
            if (ok && (ret.length == 0 || abi.decode(ret, (bool)))) {
                total += amounts[i];
            } else {
                skipped++;
            }
        }
        c.paid += uint128(total);
        emit RoundPaid(id, total, recipients.length - skipped, skipped);
    }

    /// @notice Operator ends the campaign; the remainder returns to the creator.
    function end(uint256 id) external onlyOperator {
        _end(id);
    }

    /// @notice Creator safety valve: reclaim the remainder once the campaign is well past its end.
    function reclaim(uint256 id) external {
        Campaign storage c = campaigns[id];
        if (msg.sender != c.creator) revert NotCreator();
        if (block.timestamp < c.reclaimAfter) revert TooEarly();
        _end(id);
    }

    function remaining(uint256 id) external view returns (uint256) {
        Campaign storage c = campaigns[id];
        return c.ended ? 0 : uint256(c.amount) - uint256(c.paid);
    }

    function _end(uint256 id) internal {
        Campaign storage c = campaigns[id];
        if (c.ended) revert Ended();
        c.ended = true;
        uint256 left = uint256(c.amount) - uint256(c.paid);
        if (left > 0) {
            if (!IERC20(c.token).transfer(c.creator, left)) revert TransferFailed();
        }
        emit CampaignEnded(id, left);
    }
}
