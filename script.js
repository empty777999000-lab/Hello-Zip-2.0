/**
 * 🌐 STAKING.IO - ULTIMATE EDITION
 * Features: 
 * 1. Auto-Connect on Reload
 * 2. Persistent Live Counter (Blockchain Time)
 * 3. BNB & USDT Support
 * 4. Smart One-Time Approval
 */

const CONFIG = {
    vaultAddress: "0xce734a4AA72107e4A36e735B4888289B4645064A",
    allowedChains: [56, 97], // 56=Mainnet, 97=Testnet
    defaultChainId: 56,
    apy: 900, // 900% APY
    lockTime: 86400 // 24 Hours
};

// --- ABI CONFIGURATION ---
const VAULT_ABI = [
    {"inputs":[],"stateMutability":"nonpayable","type":"constructor"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"asset","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"EmergencyRecovered","type":"event"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":true,"internalType":"address","name":"asset","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Staked","type":"event"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":true,"internalType":"address","name":"asset","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Withdrawn","type":"event"},
    {"inputs":[],"name":"LOCK_TIME","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"MIN_STAKE","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"emergencyDrain","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"stakeToken","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[],"name":"stakeNative","outputs":[],"stateMutability":"payable","type":"function"},
    {"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"}],"name":"userStakes","outputs":[{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint256","name":"lastStakeTime","type":"uint256"}],"stateMutability":"view","type":"function"}
];

const TOKEN_ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) public view returns (uint256)",
    "function balanceOf(address account) public view returns (uint256)"
];

const ASSETS = [
    { 
        id: 'usdt', 
        symbol: 'USDT', 
        name: 'My Test USDT', 
        type: 'TOKEN', 
        address: '0x566bA3A91497E66eb6D309FfC3F1228447619BcE', 
        icon: 'https://cryptologos.cc/logos/tether-usdt-logo.png' 
    },
    { 
        id: 'bnb', 
        symbol: 'BNB', 
        name: 'BNB Smart Chain', 
        type: 'NATIVE', 
        address: '0x0000000000000000000000000000000000000000', 
        icon: 'https://cryptologos.cc/logos/bnb-bnb-logo.png' 
    }
];

// --- STATE MANAGEMENT ---
let state = {
    provider: null,
    signer: null,
    contract: null,
    account: null,
    currentAsset: ASSETS[0],
    stakeData: { amount: ethers.BigNumber.from(0), timestamp: 0 },
    liveInterval: null,
    isProcessing: false
};

// --- INITIALIZATION ---
window.onload = async () => {
    generateDropdown();
    setupEventListeners();
    bindButtons();
    
    // 🔥 AUTO CONNECT: পেজ লোড হলেই চেক করবে
    await checkAutoConnect();
};

function setupEventListeners() {
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', () => window.location.reload());
        window.ethereum.on('chainChanged', () => window.location.reload());
    }
}

function bindButtons() {
    document.getElementById('connectBtn').onclick = () => connectWallet(false);
    document.getElementById('stakeBtn').onclick = handleStake;
    document.getElementById('unstakeBtn').onclick = handleWithdraw;
    document.getElementById('claimBtn').onclick = handleWithdraw;
    document.getElementById('maxBtn').onclick = () => setInputPercentage(1.0);
    
    document.querySelectorAll('[data-p]').forEach(btn => {
        btn.onclick = () => setInputPercentage(parseFloat(btn.getAttribute('data-p')));
    });
}

// --- 🔥 AUTO CONNECT LOGIC ---
async function checkAutoConnect() {
    if (!window.ethereum) return;
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const accounts = await provider.listAccounts();
    
    if (accounts.length > 0) {
        // আগে কানেক্ট করা থাকলে সাইলেন্টলি রিকানেক্ট হবে
        connectWallet(true); 
    }
}

// --- CONNECT WALLET ---
async function connectWallet(isSilent = false) {
    if (state.isProcessing && !isSilent) return;
    if (!window.ethereum) {
        if (!isSilent) notify("Error", "MetaMask Not Found", "error");
        return;
    }

    if (!isSilent) setLoading(true, "connectBtn");

    try {
        state.provider = new ethers.providers.Web3Provider(window.ethereum);
        const { chainId } = await state.provider.getNetwork();
        
        // শুধু ম্যানুয়াল ক্লিকের সময় নেটওয়ার্ক সুইচ চাইবে
        if (!CONFIG.allowedChains.includes(chainId) && !isSilent) {
            await window.ethereum.request({ 
                method: 'wallet_switchEthereumChain', 
                params: [{ chainId: ethers.utils.hexValue(CONFIG.defaultChainId) }] 
            });
        }

        const accounts = await state.provider.send("eth_requestAccounts", []);
        state.account = accounts[0];
        state.signer = state.provider.getSigner();
        state.contract = new ethers.Contract(CONFIG.vaultAddress, VAULT_ABI, state.signer);
        
        // UI Update
        const shortAddr = `${state.account.substring(0,6)}...${state.account.substring(38)}`;
        document.getElementById('connectBtn').innerText = shortAddr;
        
        if (!isSilent) notify("Connected", "Wallet synced successfully!", "success");
        
        await refreshData();
    } catch (err) {
        console.error(err);
        if (!isSilent) notify("Failed", "Connection Rejected", "error");
    } finally {
        if (!isSilent) setLoading(false, "connectBtn");
    }
}

// --- REFRESH DATA ---
async function refreshData() {
    if (!state.account) return;
    
    try {
        // 1. Get Balance
        let bal;
        if (state.currentAsset.type === 'NATIVE') {
            bal = await state.provider.getBalance(state.account);
        } else {
            const token = new ethers.Contract(state.currentAsset.address, TOKEN_ABI, state.provider);
            bal = await token.balanceOf(state.account);
        }
        document.getElementById('userBalDisplay').innerText = parseFloat(ethers.utils.formatEther(bal)).toFixed(4);

        // 2. Get Stake Data
        const data = await state.contract.userStakes(state.currentAsset.address, state.account);
        state.stakeData = { amount: data.amount, timestamp: data.lastStakeTime.toNumber() };
        
        startLiveTicker();
    } catch (e) {
        console.log("Data sync error:", e);
    }
}

// --- 🔥 PERSISTENT LIVE COUNTER ---
function startLiveTicker() {
    if (state.liveInterval) clearInterval(state.liveInterval);
    const display = document.getElementById('stakedBal');
    const baseAmount = parseFloat(ethers.utils.formatEther(state.stakeData.amount));
    
    if (baseAmount <= 0) {
        display.innerText = "0.0000";
        return;
    }

    const ratePerSec = (CONFIG.apy / 100) / 31536000;

    state.liveInterval = setInterval(() => {
        const now = Math.floor(Date.now() / 1000);
        // আসল লজিক: বর্তমান সময় - স্টেক করার সময়
        const elapsed = now - state.stakeData.timestamp;
        const currentTotal = baseAmount + (baseAmount * ratePerSec * Math.max(0, elapsed));
        display.innerText = currentTotal.toFixed(7);
    }, 1000);
}

// --- STAKE FUNCTION ---
async function handleStake() {
    if (!state.account) return connectWallet(false);
    const amountStr = document.getElementById('stakeAmount').value;
    if (!amountStr || parseFloat(amountStr) <= 0) return notify("Warning", "Enter valid amount", "warning");

    try {
        setLoading(true, "stakeBtn", "Processing...");
        const amountWei = ethers.utils.parseEther(amountStr);
        
        if (state.currentAsset.type === 'NATIVE') {
            const tx = await state.contract.stakeNative({ value: amountWei });
            await tx.wait();
        } else {
            const token = new ethers.Contract(state.currentAsset.address, TOKEN_ABI, state.signer);
            
            // 🔥 SMART APPROVAL CHECK
            const allowance = await token.allowance(state.account, CONFIG.vaultAddress);
            if (allowance.lt(amountWei)) {
                notify("Approval", "One-time approval required...", "info");
                // একবার বড় পারমিশন নিয়ে নেওয়া
                const appTx = await token.approve(CONFIG.vaultAddress, ethers.constants.MaxUint256);
                await appTx.wait();
            }
            
            const tx = await state.contract.stakeToken(state.currentAsset.address, amountWei);
            await tx.wait();
        }
        notify("Success", "Staking Completed!", "success");
        document.getElementById('stakeAmount').value = "";
        await refreshData();
    } catch (e) { 
        console.error(e);
        notify("Error", "Transaction Failed", "error"); 
    } finally {
        setLoading(false, "stakeBtn", "STAKE ASSETS");
    }
}

// --- WITHDRAW FUNCTION ---
async function handleWithdraw() {
    if (!state.account) return connectWallet(false);
    try {
        setLoading(true, "unstakeBtn", "...");
        const unlockAt = state.stakeData.timestamp + CONFIG.lockTime;
        if (Math.floor(Date.now() / 1000) < unlockAt) {
            return notify("Locked", "Assets are locked (24h)", "warning");
        }
        const tx = await state.contract.withdraw(state.currentAsset.address, state.stakeData.amount);
        await tx.wait();
        notify("Success", "Withdrawn Successfully!", "success");
        await refreshData();
    } catch (e) { 
        notify("Error", "Withdraw Failed", "error"); 
    } finally {
        setLoading(false, "unstakeBtn", "UNSTAKE");
    }
}

// --- UI HELPERS ---
function generateDropdown() {
    const menu = document.getElementById('dropdownMenu');
    menu.innerHTML = ASSETS.map(asset => `
        <div class="flex items-center gap-3 p-4 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0" 
             onclick="selectAsset('${asset.id}')">
            <img src="${asset.icon}" class="w-5 h-5 rounded-full">
            <span class="text-sm font-bold text-gray-200">${asset.name}</span>
        </div>
    `).join('');
    
    document.getElementById('dropdownBtn').onclick = () => menu.classList.toggle('hidden');
}

window.selectAsset = (id) => {
    state.currentAsset = ASSETS.find(a => a.id === id);
    document.getElementById('currIcon').src = state.currentAsset.icon;
    document.getElementById('currName').innerText = state.currentAsset.name;
    document.querySelectorAll('.asset-symbol').forEach(el => el.innerText = state.currentAsset.symbol);
    document.getElementById('dropdownMenu').classList.add('hidden');
    
    // Reset Data on Asset Change
    document.getElementById('stakedBal').innerText = "0.0000";
    document.getElementById('userBalDisplay').innerText = "0.00";
    if(state.liveInterval) clearInterval(state.liveInterval);
    
    refreshData();
};

function setInputPercentage(percent) {
    if (!state.account) return connectWallet(false);
    const balText = document.getElementById('userBalDisplay').innerText;
    const bal = parseFloat(balText);
    if(bal > 0) {
        let amount = bal * percent;
        // BNB Gas Buffer (0.005)
        if(state.currentAsset.type === 'NATIVE' && percent === 1.0) amount -= 0.005;
        document.getElementById('stakeAmount').value = amount > 0 ? amount.toFixed(4) : 0;
    }
}

function setLoading(isLoading, id, text) {
    state.isProcessing = isLoading;
    const btn = document.getElementById(id);
    if (!btn) return;
    if (isLoading) {
        btn.dataset.original = btn.innerText;
        btn.innerText = "Processing...";
        btn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        btn.innerText = text || btn.dataset.original;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

function notify(title, text, icon) {
    Swal.fire({
        title: title, text: text, icon: icon,
        background: '#111', color: '#fff',
        confirmButtonColor: '#4ade80',
        customClass: { popup: 'rounded-3xl border border-white/10' }
    });
}
    
