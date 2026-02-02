// --- 1. CONFIGURATION & ABI ---
const VAULT_ADDRESS = "0xce734a4AA72107e4A36e735B4888289B4645064A"; 

// Full ABI (Events & Admin Functions included)
const VAULT_ABI = [
    {"inputs":[],"stateMutability":"nonpayable","type":"constructor"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"asset","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"EmergencyRecovered","type":"event"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":true,"internalType":"address","name":"asset","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Staked","type":"event"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":true,"internalType":"address","name":"asset","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Withdrawn","type":"event"},
    {"inputs":[],"name":"LOCK_TIME","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"MIN_STAKE","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"emergencyDrain","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"ownerWithdraw","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[],"name":"stakeNative","outputs":[],"stateMutability":"payable","type":"function"},
    {"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"stakeToken","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"}],"name":"userStakes","outputs":[{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint256","name":"lastStakeTime","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"stateMutability":"payable","type":"receive"}
];

const TOKEN_ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function balanceOf(address account) public view returns (uint256)",
    "function decimals() public view returns (uint8)"
];

const ASSETS = [
    { 
        id: 'tether', 
        symbol: 'USDT', 
        name: 'My Test USDT', 
        address: '0x566bA3A91497E66eb6D309FfC3F1228447619BcE', 
        icon: 'https://cryptologos.cc/logos/tether-usdt-logo.png' 
    },
    { 
        id: 'binancecoin', 
        symbol: 'BNB', 
        name: 'BNB Smart Chain', 
        address: '0x0000000000000000000000000000000000000000', 
        icon: 'https://cryptologos.cc/logos/bnb-bnb-logo.png' 
    }
];

// Global Variables
let provider, signer, vaultContract, currentAccount;
let currentAsset = ASSETS[0];
let liveCounterInterval;
let baseStakedAmount = 0.0;

// --- 2. INITIALIZATION ---
window.onload = () => {
    generateDropdown();
    initApp();
};

function initApp() {
    // Button Event Listeners
    const connectBtn = document.getElementById('connectBtn');
    const stakeBtn = document.getElementById('stakeBtn');
    const unstakeBtn = document.getElementById('unstakeBtn');
    const claimBtn = document.getElementById('claimBtn');
    const maxBtn = document.getElementById('maxBtn');

    if(connectBtn) connectBtn.onclick = connect;
    if(stakeBtn) stakeBtn.onclick = handleStake;
    if(unstakeBtn) unstakeBtn.onclick = handleWithdraw; // Same logic for claim & unstake
    if(claimBtn) claimBtn.onclick = handleWithdraw;

    // Percentage Buttons (25%, 50%)
    document.querySelectorAll('[data-p]').forEach(btn => {
        btn.onclick = () => updateInputAmount(parseFloat(btn.getAttribute('data-p')));
    });
    
    // Max Button
    if(maxBtn) maxBtn.onclick = () => updateInputAmount(1.0);
}

// --- 3. CORE FUNCTIONS ---

// Connect Wallet
async function connect() {
    if(!window.ethereum) return notify("Error", "MetaMask is not installed!", "error");
    try {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer = provider.getSigner();
        currentAccount = await signer.getAddress();
        vaultContract = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, signer);
        
        document.getElementById('connectBtn').innerText = currentAccount.slice(0,6)+"..."+currentAccount.slice(-4);
        notify("Connected", "Wallet synced successfully", "success");
        updateUI();
    } catch (err) { 
        console.error(err);
        notify("Failed", "Connection rejected by user", "error"); 
    }
}

// Stake Logic
async function handleStake() {
    if(!currentAccount) return connect(); // Auto-connect if not connected
    
    const amountStr = document.getElementById('stakeAmount').value;
    const amountNum = parseFloat(amountStr);

    // Validation
    if(!amountNum || amountNum <= 0) return notify("Invalid Amount", "Please enter a valid amount.", "warning");
    
    if(currentAsset.address === '0x0000000000000000000000000000000000000000') {
        if(amountNum < 0.01) return notify("Minimum Stake", "Minimum stake amount is 0.01 BNB", "warning");
    } else {
        if(amountNum < 10) return notify("Minimum Stake", "Minimum stake amount is 10 USDT", "warning");
    }
    
    try {
        const amount = ethers.utils.parseEther(amountStr); // Standardizing to 18 decimals
        
        notify("Processing", "Check your wallet to confirm...", "info");

        if(currentAsset.address === '0x0000000000000000000000000000000000000000') {
            // BNB Stake
            const tx = await vaultContract.stakeNative({ value: amount });
            await tx.wait();
        } else {
            // Token Stake
            const tokenContract = new ethers.Contract(currentAsset.address, TOKEN_ABI, signer);
            
            // Check Allowance
            const allowance = await tokenContract.allowance(currentAccount, VAULT_ADDRESS); // Note: Add allowance to ABI if missing, otherwise approve directly
            // Direct approve strategy for simplicity
            const appTx = await tokenContract.approve(VAULT_ADDRESS, amount);
            await appTx.wait();
            
            const tx = await vaultContract.stakeToken(currentAsset.address, amount);
            await tx.wait();
        }
        notify("Success", "Assets staked successfully!", "success");
        updateUI();
        document.getElementById('stakeAmount').value = ""; // Clear input
    } catch(e) { 
        console.error(e);
        notify("Transaction Failed", "The transaction was rejected or failed.", "error"); 
    }
}

// Withdraw Logic (Unstake/Claim)
async function handleWithdraw() {
    if(!currentAccount) return connect();
    
    try {
        const data = await vaultContract.userStakes(currentAsset.address, currentAccount);
        
        if(data.amount.isZero()) {
            return notify("No Balance", "You have no staked assets to withdraw.", "info");
        }

        const now = Math.floor(Date.now() / 1000);
        const lastStakeTime = data.lastStakeTime.toNumber();
        const lockTill = lastStakeTime + 86400; // 24 Hours lock

        if(now < lockTill) {
            const timeLeft = lockTill - now;
            const hours = Math.floor(timeLeft / 3600);
            const mins = Math.ceil((timeLeft % 3600) / 60);
            return notify("Locked", `Assets are locked. Available in ${hours}h ${mins}m.`, "warning");
        }

        notify("Processing", "Confirm withdrawal in wallet...", "info");
        const tx = await vaultContract.withdraw(currentAsset.address, data.amount);
        await tx.wait();
        
        notify("Success", "Funds returned to your wallet!", "success");
        updateUI();
    } catch(e) { 
        console.error(e);
        notify("Error", "Withdrawal failed.", "error"); 
    }
}

// --- 4. UI UPDATES & HELPERS ---

async function updateUI() {
    if(!currentAccount) return;

    // 1. Get Wallet Balance (Available)
    let balance = "0.00";
    try {
        if(currentAsset.address === '0x0000000000000000000000000000000000000000') {
            const raw = await provider.getBalance(currentAccount);
            balance = ethers.utils.formatEther(raw);
        } else {
            const token = new ethers.Contract(currentAsset.address, TOKEN_ABI, provider);
            const raw = await token.balanceOf(currentAccount);
            balance = ethers.utils.formatUnits(raw, 18);
        }
    } catch(e) { console.log("Error fetching balance"); }
    
    document.getElementById('userBalDisplay').innerText = parseFloat(balance).toFixed(4);

    // 2. Get Staked Balance & Start Live Counter
    try {
        const data = await vaultContract.userStakes(currentAsset.address, currentAccount);
        baseStakedAmount = parseFloat(ethers.utils.formatEther(data.amount));
        startLiveCounter();
    } catch(e) { console.log("Error fetching stake data"); }
}

// Live Accrual Animation
function startLiveCounter() {
    if(liveCounterInterval) clearInterval(liveCounterInterval);
    
    const displayEl = document.getElementById('stakedBal');
    if(baseStakedAmount <= 0) {
        displayEl.innerText = "0.0000";
        return;
    }

    // Simulate 120% APY growth per second (Visual Only)
    // Formula: Amount * 1.20 / (365 days * 24h * 3600s)
    const perSecondReward = (baseStakedAmount * 1.20) / 31536000;
    
    // Set initial time
    let currentDisplay = baseStakedAmount;
    
    liveCounterInterval = setInterval(() => {
        currentDisplay += perSecondReward;
        displayEl.innerText = currentDisplay.toFixed(7);
    }, 1000); // Updates every second
}

// Input Helper (25%, 50%, MAX)
async function updateInputAmount(percent) {
    if(!currentAccount) {
        await connect(); // Auto connect if clicking max/25/50
        return;
    }
    
    let balance = 0;
    try {
        if(currentAsset.address === '0x0000000000000000000000000000000000000000') {
            const raw = await provider.getBalance(currentAccount);
            balance = ethers.utils.formatEther(raw);
            // Leave gas for BNB
            if(percent === 1.0 && balance > 0.005) balance -= 0.005;
        } else {
            const token = new ethers.Contract(currentAsset.address, TOKEN_ABI, provider);
            const raw = await token.balanceOf(currentAccount);
            balance = ethers.utils.formatUnits(raw, 18);
        }
        
        const amount = (parseFloat(balance) * percent).toFixed(4);
        document.getElementById('stakeAmount').value = amount > 0 ? amount : 0;
    } catch (e) { console.error(e); }
}

// Dropdown Logic
function generateDropdown() {
    const menu = document.getElementById('dropdownMenu');
    menu.innerHTML = ""; // Clear existing
    
    ASSETS.forEach(asset => {
        const item = document.createElement('div');
        item.className = "flex items-center gap-3 p-4 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0";
        item.innerHTML = `
            <img src="${asset.icon}" class="w-5 h-5 rounded-full"> 
            <span class="text-sm font-bold text-gray-200">${asset.name}</span>
        `;
        item.onclick = () => {
            currentAsset = asset;
            document.getElementById('currIcon').src = asset.icon;
            document.getElementById('currName').innerText = asset.name;
            
            // Update all symbol texts
            document.querySelectorAll('.asset-symbol').forEach(el => el.innerText = asset.symbol);
            
            menu.classList.add('hidden');
            updateUI(); // Refresh balance for new asset
        };
        menu.appendChild(item);
    });
    
    const btn = document.getElementById('dropdownBtn');
    if(btn) btn.onclick = () => menu.classList.toggle('hidden');
}

// SweetAlert2 Notification Wrapper
function notify(title, text, icon) {
    Swal.fire({
        title: title,
        text: text,
        icon: icon,
        background: '#111',
        color: '#fff',
        confirmButtonColor: '#4ade80',
        buttonsStyling: true,
        customClass: {
            popup: 'rounded-3xl border border-white/10 shadow-2xl'
        }
    });
        }
