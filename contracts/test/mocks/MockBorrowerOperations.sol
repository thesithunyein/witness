// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice MUSD as BorrowerOperations sees it: it mints on borrow and burns on
///         repay, without an approval from the borrower.
contract MockMUSD {
    string public constant symbol = "MUSD";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    address public minter;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function setMinter(address minter_) external {
        require(minter == address(0), "minter set");
        minter = minter_;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "not minter");
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function burn(address from, uint256 amount) external {
        require(msg.sender == minter, "not minter");
        require(balanceOf[from] >= amount, "burn exceeds balance");
        balanceOf[from] -= amount;
        totalSupply -= amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        allowance[from][msg.sender] = a - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/// @notice The trove surface of Mezo's BorrowerOperations: every call acts on the
///         trove of `msg.sender`, borrowing mints MUSD to it, and repaying burns
///         MUSD from it. Fees and hints are not modelled; the safe measures what
///         actually arrives, so the real fee does not change its accounting.
contract MockBorrowerOperations {
    MockMUSD public immutable musdToken;
    mapping(address => uint256) public coll;
    mapping(address => uint256) public debt;
    address public lastUpperHint;
    address public lastLowerHint;

    constructor(MockMUSD musd_) {
        musdToken = musd_;
    }

    function musd() external view returns (address) {
        return address(musdToken);
    }

    function openTrove(uint256 _debtAmount, address _upperHint, address _lowerHint)
        external
        payable
    {
        require(coll[msg.sender] == 0, "trove exists");
        require(msg.value > 0 && _debtAmount > 0, "empty trove");
        coll[msg.sender] = msg.value;
        debt[msg.sender] = _debtAmount;
        lastUpperHint = _upperHint;
        lastLowerHint = _lowerHint;
        musdToken.mint(msg.sender, _debtAmount);
    }

    function addColl(address _upperHint, address _lowerHint) external payable {
        require(coll[msg.sender] > 0, "no trove");
        coll[msg.sender] += msg.value;
        lastUpperHint = _upperHint;
        lastLowerHint = _lowerHint;
    }

    function repayMUSD(uint256 _amount, address _upperHint, address _lowerHint) external {
        require(debt[msg.sender] >= _amount, "repay exceeds debt");
        debt[msg.sender] -= _amount;
        lastUpperHint = _upperHint;
        lastLowerHint = _lowerHint;
        musdToken.burn(msg.sender, _amount);
    }
}

/// @notice A BorrowerOperations whose debt token is not the safe's token.
contract MockWrongDebtBorrowerOperations {
    function musd() external pure returns (address) {
        return address(0xDEAD);
    }
}
