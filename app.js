// ===============================
// Simple Bank V2 - Stable Version
// ==============================

    let web3;
    let bankContract;
    let userAccount;
    
    // ===== DOM ELEMENTS =====
    const connectButton = document.getElementById('connectButton');
    const connectedAccountSpan = document.getElementById("connectedAccount");
    const userBalanceSpan = document.getElementById("userBalance");
    const contractBalanceSpan = document.getElementById("contractBalance");
    const refreshButton = document.getElementById("refreshButton");
    const depositButton = document.getElementById("depositButton");
    const withdrawButton = document.getElementById("withdrawButton");
    const claimInterestButton = document.getElementById("claimInterestButton");
    const refreshHistoryButton = document.getElementById("refreshHistoryButton");
    const transactionList = document.getElementById("transactionList");
    const interestRateSpan = document.getElementById("interestRate");
    const pendingInterestSpan = document.getElementById("pendingInterest");
    const depositAmountInput = document.getElementById("depositAmount");
    const withdrawAmountInput = document.getElementById("withdrawAmount");
    const txCountSpan = document.getElementById('txCount');
    const statusDiv = document.getElementById("status");
    const maxDepositButton = document.getElementById('maxDepositButton');
    const withdrawAllButton = document.getElementById('withdrawAllButton');

    
     // ==========================
     // HELPERS FUNCTIONS
     // ==========================


    function showStatus(message, type = "info", duration = 5000) {
        if (statusDiv) {
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        if (duration > 0 && type === 'success') {
            setTimeout(() => {
                if (statusDiv.textContent === message) {
                    statusDiv.textContent = "";
                    statusDiv.className = 'status info';
                }
            }, duration);
        }
    }
        console.log(`[${type.toUpperCase()}] ${message}`);
    }


    function setButtonLoading(button, isLoading, originalText = null) {
        if (!button) return;
        if (isLoading) {
            button.dataset.originalText = originalText || button.innerHTML;
            button.innerHTML = 'Processing...';
            button.disabled = true;
            button.classList.add('loading');
        } else {
            button.innerHTML = button.dataset.originalText || 'Submit';
            button.disabled = false;
            button.classList.remove('loading');
        }
    }

    function formatAddress(address) {
        if (!address) return "";
        return `${address.substring(0, 6)}...${address.substring(38)}`;
    }

    
    // ===== BUTTON ORIGINAL TEXTS =====
    const originalButtonTexts = {
        connect: connectButton ? connectButton.innerHTML : "Connect MetaMask",
        deposit: depositButton ? depositButton.innerHTML : "Deposit",
        withdraw: withdrawButton ? withdrawButton.innerHTML : "Withdraw",
        claim: claimInterestButton ? claimInterestButton.innerHTML : "Claim Interest",
        refresh: refreshButton ? refreshButton.innerHTML : "Refresh",
        refreshHistory: refreshHistoryButton ? refreshHistoryButton.innerHTML : "Refresh History"
    };

    // ==========================
    // CONNECT WALLET
    // ==========================
    async function connectWallet() {
        setButtonLoading(connectButton, true, 'Connect Metamask');
        showStatus('Connecting to MetaMask...', 'info');
        
        if (typeof window.ethereum === 'undefined') {
            showStatus("MetaMask not detected!", "error");
            setButtonLoading(connectButton, false);
            return;
        }

        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            userAccount = accounts[0];

            if (connectButton) {
                connectButton.innerHTML = `${formatAddress(userAccount)}`;
                connectButton.disabled = true;
            }
            if (connectedAccountSpan) {
                connectedAccountSpan.textContent = formatAddress(userAccount);
            }

            web3 = new Web3(window.ethereum);

            const config = window.CONTRACT_CONFIG;
            if (!config || !config.address || !config.abi) {
                throw new Error('Contract congif not loaded');
            }

            bankContract = new web3.eth.Contract(config.abi, config.address);

            showStatus("Wallet connected successfully!", "success");

            await Promise.all([
                 updateBalances(),
                 loadTransactionHistory(),
                 startAutoRefresh()
                ]);

            window.ethereum.on("accountsChanged", handleAccountsChanged);
            window.ethereum.on("chainChanged", () => window.location.reload());

        } catch (error) {
            console.error('Connection error:', error);
            showStatus(`Connection failed: ${error.message}`, 'error');
            setButtonLoading(connectButton, false);
        }
    }

    // ==========================
    // UPDATE BALANCES
    // ==========================
    async function updateBalances() {
        if (!bankContract || !userAccount) return;

        setButtonLoading(refreshButton, true, 'Refresh');
        try {
            const [userBalanceWei, contractBalanceWei, pendingInterestWei, interestRateBasis] = await Promise.all([
            bankContract.methods.getBalance().call({ from: userAccount }),
            bankContract.methods.getContractBalance().call(),
            bankContract.methods.getPendingInterest(userAccount).call({from: userAccount}),
            bankContract.methods.interestRate().call()
            ]);

            const userBalanceEth = web3.utils.fromWei(userBalanceWei, 'ether');
            const contractBalanceEth = web3.utils.fromWei(contractBalanceWei, 'ether');
            const pendingInterestEth = web3.utils.fromWei(pendingInterestWei, 'ether');
            const interestRatePercent = (Number(interestRateBasis) /100).toFixed(2);

            if (userBalanceSpan) userBalanceSpan.textContent = parseFloat(userBalanceEth).toFixed(6);
            if(contractBalanceSpan) contractBalanceSpan.textContent = parseFloat(contractBalanceEth).toFixed(6);
            if (pendingInterestSpan) pendingInterestSpan.textContent = parseFloat(pendingInterestEth).toFixed(6);
            if (interestRateSpan) interestRateSpan.textContent = interestRatePercent;

            if (parseFloat(pendingInterestEth) > 0) {
            showStatus(`You have ${parseFloat(pendingInterestEth).toFixed(6)} ETH pending interest!`, 'success', 3000);
            }

                
            const userBalanceNum = parseFloat(web3.utils.fromWei(userBalanceWei, 'ether'));
            const rate = Number(interestRateBasis) / 100;
         if (userBalanceNum > 0) {
            
            const oneDay = (userBalanceNum * rate * 1) / 365;
            const sevenDays = (userBalanceNum * rate * 7) /365;
            const thirtyDays = (userBalanceNum * rate * 30) / 365;

            document.getElementById('interest1Day').textContent = oneDay.toFixed(6) + 'ETH';
            document.getElementById('interest7Days').textContent = sevenDays.toFixed(6) + 'ETH';
            document.getElementById('interest30Days').textContent = thirtyDays.toFixed(6) + 'ETH';
        } else {
            document.getElementById('interest1Day').textContent = '0 ETH';
            document.getElementById('interest7Days').textContent = '0 ETH';
            document.getElementById('interest30Days').textContent = '0 ETH';
        }
        if (bankContract.methods.maxDeposit) {
            try {
            const maxWei = await bankContract.methods.maxDeposit().call();
            const maxEth = web3.utils.fromWei(maxWei, 'ether');
            const maxDepositElem = document.getElementById('maxDepositDisplay');
            if (maxDepositElem) maxDepositElem.textContent = parseFloat(maxEth).toFixed(6) + 'ETH';
            } catch (e) {
                   console.warn('Could not fetch maxDeposit', e);    
            }
        }

        if (bankContract.methods.minDeposit) {
           try {
            const minWei = await bankContract.methods.minDeposit().call();
            const minEth = web3.utils.fromWei(minWei, 'ether');
            const minDepositElem = document.getElementById('minDepositDisplay');
            if (minDepositElem) minDepositElem.textContent = parseFloat(minEth).toFixed(6) + 'ETH';
        } catch (e) {
            console.warn('Could not fetch minDeposit', e);
        }
        }

             showStatus('Balances updated', 'success', 2000);
             
        } catch (error) {
            console.error('Balance update error:', error);
            showStatus(`Failed to update balances: ${error.message}`, 'error');
        } finally {
            setButtonLoading(refreshButton, false);
        }
    }

    // ==========================
    // DEPOSIT
    // ==========================
    async function deposit() {
        if (!depositAmountInput) return;
        const amount = depositAmountInput.value;

        if (!amount || amount <= 0) {
            showStatus('Please enter a valid amount.', 'error');
            return;
        }

        if (!bankContract || !userAccount) {
            showStatus('Please connect your wallet first', 'error');
            return;
        }

        setButtonLoading(depositButton, true, 'Deposit');

        try {
            const amountWei = web3.utils.toWei(amount, 'ether');
            showStatus(`Processing deposit of ${amount} ETH...`, 'info');

            const tx = await bankContract.methods.deposit().send({
                from: userAccount,
                value: amountWei
            });

            showStatus(`Sucessfully deposited ${amount} ETH!`, 'success');
            depositAmountInput.value = "";

            await Promise.all([
                 updateBalances(),
                 loadTransactionHistory()
            ]);

            const minWei = await bankContract.methods.minDeposit().call();
            if (minWei > 0 && amountWei < minWei) {
                const minEth = web3.utils.fromWei(minWei, 'ether');
                showStatus(`Minimum deposit is ${minEth} ETH`, 'error');
                return;
            }
            
      if (tx.transactionHash) {
         showStatus(`View on Etherscan: Sepolia.etherscan.io/tx/${tx.transactionHash}`, 'info', 8000);
      }

        } catch (error) {
            console.error( 'Deposit error:', error);
            showStatus(`Deposit failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(depositButton, false);
        }
    }

    // ==========================
    // WITHDRAW
    // ==========================
    async function withdraw() {
       if (!withdrawAmountInput) return; 
       const amount = withdrawAmountInput.value;

        if (!amount || amount <= 0) {
            showStatus('Please enter a valid amount.', 'error');
            return;
        }

        if (!bankContract || !userAccount) {
        showStatus('Please connect your wallet first', 'error');
        return;
        }

         setButtonLoading(withdrawButton, true, 'Withdraw');
        try {
            const amountWei = web3.utils.toWei(amount, 'ether');
            showStatus(`Processing withdrawal of ${amount} ETH...`, 'info');

           const tx = await bankContract.methods.withdraw(amountWei).send({
                from: userAccount
            });

            showStatus(`Sucessfully withdrew ${amount} ETH`, 'success');
            withdrawAmountInput.value = "";
            

            await Promise.all([
                updateBalances(),
                loadTransactionHistory()
            ]);

            if (tx.transactionHash) {
         showStatus(`View on Etherscan: Sepolia.etherscan.io/tx/${tx.transactionHash}`, 'info', 8000);
      }

        } catch (error) {
            console.error('Withdraw error', error);
            showStatus(`Withdrawal failed: ${error.message}`, 'error');
        } finally {
            setButtonLoading(withdrawButton, false);
        }
    }

    // ==========================
    // CLAIM INTEREST
    // ==========================
    async function claimInterest() {
       if (!bankContract || !userAccount) {
       showStatus('Please connect your wallet first', 'error');
       return;
}    

       setButtonLoading(claimInterestButton, true, 'Claim Interest');
    try {
            showStatus('Claiming interest...', 'info');

            const tx = await bankContract.methods.claimInterest().send({
                from: userAccount
            });

            showStatus('Interest claimed successfully!', 'success');
            
            await Promise.all([
                updateBalances(),
                loadTransactionHistory()
            ]);

         if (tx.transactionHash) {
         showStatus(`View on Etherscan: Sepolia.etherscan.io/tx/${tx.transactionHash}`, 'info', 8000);
      }

        } catch (error) {
            console.error('Claim interest error', error);
            if (error.message.includes('No interest available yet')) {
            showStatus('No interest available yet. Interest accrues daily', 'info');
            } else {
            showStatus(`Failed to claim interest: ${error.message}`, 'error');
        } 
     }finally {
            setButtonLoading(claimInterestButton, false);
        }
    }

    // ==========================
    // TRANSACTION HISTORY
    // ==========================
    async function loadTransactionHistory() {
        if (!bankContract || !userAccount) {
        if (transactionList) transactionList.innerHTML = '<div class="loading-spinner">Connect wallet to see transactions</div>';
        return;
        }

        setButtonLoading(refreshHistoryButton, true, 'Refresh');
        if (transactionList) transactionList.innerHTML = '<div class="loading-spinner">Loading transactions...</div>';

        try {

            const [depositEvents, withdrawEvents] = await Promise.all([
            bankContract.getPastEvents('Deposit', {
                filter: { user: userAccount },
                fromBlock: 0,
                toBlock: 'latest'
            }),
            bankContract.getPastEvents('Withdrawal', {
                filter: { user: userAccount },
                fromBlock: 0,
                toBlock: 'latest'
            })
        ]);

         let allEvents = [...depositEvents, ...withdrawEvents];
         allEvents.sort((a, b) => b.blockNumber - a.blockNumber);

         const recentEvents = allEvents.slice(0, 10);

         if (txCountSpan) {
          txCountSpan.textContent = `${allEvents.length} total transaction`;
         }

         if (recentEvents.length === 0) {
         if (transactionList) transactionList.innerHTML = '<div class="loading-spinner">No transaction yet. Make a deposit!</div>';
         return;
         }

         let html = "";
         recentEvents.forEach(event => {
            const isDeposit = event.event ==='Deposit';
            const type = isDeposit ? 'Deposit' : 'Withdraw';
            const amountWei = event.returnValues.amount;
            const amountEth = web3.utils.fromWei(amountWei, 'ether');
            const blockNumber = event.blockNumber;
            const txHash = event.transactionHash;

            html += `
            <div class="transaction-item ${isDeposit ? 'deposit' : 'withdraw'}">
                <div class="transaction-item ${isDeposit ? 'deposit' : 'withdraw'}">
                    ${type}
                </div>
                <div class="transaction-amount">
                    ${parseFloat(amountEth).toFixed(6)} ETH
                </div>
                <div class="transaction-time">
                    Block: ${blockNumber}
                </div>
                <a href="https://sepolia.etherscan.io/tx/${txHash}" target="_blank" class="transaction-hash">
                View
                </a>
            </div>
            `;
            });

            if (transactionList) transactionList.innerHTML = html;
            showStatus('Transaction history updated', 'success', 2000);

         } catch (error) {
            console.error('Error loading transaction history', error);
            if (transactionList) transactionList.innerHTML = '<div class="loading-spinner">Error loading transactions.Try refreshing</div>';
             showStatus('Failed to load transaction history', 'error');
            } finally {
            setButtonLoading(refreshHistoryButton, false);
        }
    }

    // ==========================
    // ACCOUNT CHANGE HANDLER
    // ==========================
    function handleAccountsChanged(accounts) {
        if (accounts.length === 0) {
            stopAutoRefresh();
            showStatus('Wallet disconnected.', 'info');
            userAccount = null;
            if (connectButton) {
            connectButton.innerHTML = 'Connect MetaMask';
            connectButton.disabled = false;
            }
            if (connectedAccountSpan) connectedAccountSpan.textContent = 'Not Connected';
            if (userBalanceSpan) userBalanceSpan.textContent = '0';
            if (contractBalanceSpan) contractBalanceSpan.textContent = '0';
            if (pendingInterestSpan) pendingInterestSpan.textContent = '0';
            if (transactionList) transactionList.innerHTML = '<div class="loading-spinner">Connect wallet to see transactions</div>';

        } else if (accounts[0] !== userAccount) {
            userAccount = accounts[0];
            if (connectedAccountSpan) connectedAccountSpan.textContent = formatAddress(userAccount);
            showStatus('Account switched', 'info');
            Promise.all([updateBalances(), loadTransactionHistory()]);
        }

    }

    // ==================
    //  ETH Balance
    // ==================
    async function getUserEthBalance() {
        if (!userAccount) return 0;
        const balanceWei = await web3.eth.getBalance(userAccount);
        return web3.utils.fromWei(balanceWei, 'ether');
    }

    // ===================
    // MAX DEPOSIT
    // ===================
    async function setMaxDeposit() {
        if (!userAccount) {
            showStatus("Connect wallet first", 'error');
            return;
        }
        if (!bankContract) {
            showStatus("Contract not initialized", 'error');
            return;
        }
        try {
            const userBalanceWei = await web3.eth.getBalance(userAccount);
            const userBalanceWeiBig = BigInt(userBalanceWei);

            const gasEstimate = await bankContract.methods.deposit().estimateGas({ from: userAccount, value: '1'});
            const gasPrice = BigInt(await web3.eth.getGasPrice());
            const gasCostWei = BigInt(gasEstimate) * gasPrice;
             
            const gasBuffer = (gasCostWei * 10n) / 100n;
            const totalGasWei = gasCostWei + gasBuffer;

            if (userBalanceWeiBig <= totalGasWei) {
                showStatus("Not enough ETH to cover gas.Please add more ETH", 'error');
                depositAmountInput.value = '0';
                return;
            }
            const maxDepositWei = userBalanceWeiBig - totalGasWei;
            
            const maxDepositEth = web3.utils.fromWei(maxDepositWei.toString(), 'ether');
            let finalDepositEth = parseFloat(maxDepositEth);
                        
            if (bankContract.methods.maxDeposit) {
                try {
                const contractMaxWei = await bankContract.methods.maxDeposit().call();
                const contractMaxEth = parseFloat(web3.utils.fromWei(contractMaxWei, 'ether'));
                if (contractMaxEth > 0 && contractMaxEth < finalDepositEth) {
                    finalDepositEth = contractMaxEth;
                    showStatus(`Contract limit (${contractMaxEth.toFixed(6)} ETH)`, 'info', 2000);
                } 
            } catch (e) {
                console.warn("Could not fetch contract maxDeposit.", e);
            }
        }

            depositAmountInput.value = finalDepositEth.toFixed(6);         
            showStatus(`Max deposit set to ${finalDepositEth.toFixed(6)} ETH (reserving gas fee)`, 'success');
        } catch (error) {
            console.error('Failed to set max deposit:', error);
            showStatus('Could not fetch max deposit', 'error');
        }
    }

    //====================
    //  WITHDRAW ALL
    //====================
    async function withdrawAll() {
        if (!bankContract || !userAccount) {
            showStatus('Connect wallet first', 'error');
            return;
        }
        try {
            const balanceWei = await bankContract.methods.getBalance().call({ from: userAccount });
            const balanceEth = web3.utils.fromWei(balanceWei, 'ether');
            if (balanceWei == 0) {
                showStatus('No balance to withdraw', 'info');
                withdrawAmountInput.value = "";
                return;
            }
            
            withdrawAmountInput.value = parseFloat(balanceEth).toFixed(6);
            showStatus(`Withdraw amount set to ${balanceEth} ETH. Click Withdraw to confirm.`, 'success');
        } catch (error) {
            console.error('Withdraw all error.', error);
            showStatus('Failed to get balance', 'error');
        }
    }

   
    // ==========================
    // EVENT LISTENERS
    // ==========================
    if (connectButton) connectButton.addEventListener("click", connectWallet);
    if (refreshButton) refreshButton.addEventListener("click", updateBalances);
    if (depositButton) depositButton.addEventListener("click", deposit);
    if (withdrawButton) withdrawButton.addEventListener("click", withdraw);
    if (claimInterestButton) claimInterestButton.addEventListener("click", claimInterest);
    if (refreshHistoryButton) refreshHistoryButton.addEventListener("click", loadTransactionHistory);
    if (maxDepositButton) maxDepositButton.addEventListener('click', setMaxDeposit);
    if (withdrawAllButton) withdrawAllButton.addEventListener('click', withdrawAll);


    //========================
    //  AUTO REFRESH
    //========================
    let autoRefreshInterval;
    function startAutoRefresh() {
        if (autoRefreshInterval) clearInterval(autoRefreshInterval);
        autoRefreshInterval = setInterval(() => {
            if (bankContract && userAccount) {
                updateBalances();
                loadTransactionHistory();
            }
        }, 10000);
    }
    function stopAutoRefresh() {
        if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    }

    showStatus('Ready to connect. Click "Connect MetaMask".', "info");
    console.log('SimpleBank dApp initialized with enhanced features');
