/**
 * 🌐 STAKING.IO - ULTIMATE PRO EDITION
 * -------------------------------------
 * Features:
 * - Multi-Network Support (BSC Mainnet & Testnet)
 * - Persistent Live Counter (Fixes refresh reset)
 * - Smart Allowance & Auto-Staking
 * - Enterprise Grade Error Handling
 * - 100% English UI Alerts
 */

// --- 1. CONFIGURATION ---
const CONFIG = {
    vaultAddress: "0xce734a4AA72107e4A36e735B4888289B4645064A",
    allowedChains: [56, 97], // 56 = Mainnet, 97 = Testnet
    defaultChainId: 56,
    gasBuffer: 0.005,
    apy: 120, // 120% APY
    lockTime: 86400 // 24 Hours
};

// Full ABI for Staking & Admin Control
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
    "function balanceOf(address account) public view returns (uint256)",
    "function decimals() public view returns (uint8)"
];

const ASSETS = [
    { id: 'usdt', symbol: 'USDT', name: 'My Test USDT', type: 'TOKEN', address: '0x566bA3A91497E66eb6D309FfC3F1228447619BcE', icon: 'https://cryptologos.cc/logos/tether-usdt-logo.png' },
    { id: 'bnb', symbol: 'BNB', name: 'BNB Smart Chain', type: 'NATIVE', address: '0x0000000000000000000000000000000000000000', icon: 'https://cryptologos.cc/logos/bnb-bnb-logo.png' }
];

// Global State
let state = {
    provider: null, signer: null, contract: null, account: null,
    currentAsset: ASSETS[0],
    stakeData: { amount: ethers.BigNumber.from(0), timestamp: 0 },
    walletBalance: ethers.BigNumber.from(0),
    liveInterval: null,
    isProcessing: false
};

// --- 2. INITIALIZATION ---
window.onload = () => {
    generateDropdown();
    setupListeners();
    bindButtons();
};

function bindButtons() {
    document.getElementById('connectBtn').onclick = connectWallet;
    document.getElementById('stakeBtn').onclick = handleStake;
    document.getElementById('unstakeBtn').onclick = handleWithdraw;
    document.getElementById('claimBtn').onclick = handleWithdraw;
    document.getElementById('maxBtn').onclick = () => setInputPercentage(1.0);
    document.querySelectorAll('[data-p]').forEach(btn => {
        btn.onclick = () => setInputPercentage(parseFloat(btn.getAttribute('data-p')));
    });
}

function setupListeners() {
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', () => window.location.reload());
        window.ethereum.on('chainChanged', () => window.location.reload());
    }
}

// --- 3. CORE FUNCTIONS ---

async function connectWallet() {
    if (state.isProcessing || !window.ethereum) return;

    setLoading(true, "connectBtn");
    try {
        state.provider = new ethers.providers.Web3Provider(window.ethereum);
        
        // Logical Check: Allowed Networks (56 or 97)
        const { chainId } = await state.provider.getNetwork();
        if (!CONFIG.allowedChains.includes(chainId)) {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: ethers.utils.hexValue(CONFIG.defaultChainId) }],
            });
        }

        const accounts = await state.provider.send("eth_requestAccounts", []);
        state.account = accounts[0];
        state.signer = state.provider.getSigner();
        state.contract = new ethers.Contract(CONFIG.vaultAddress, VAULT_ABI, state.signer);

        // UI Update Sequence
        const btn = document.getElementById('connectBtn');
        btn.innerText = `${state.account.substring(0,6)}...${state.account.substring(38)}`;
        
        notify("Connected", "Secure connection established.", "success");
        await refreshData();
    } catch (err) {
        console.error(err);
        notify("Failed", "Could not connect wallet.", "error");
    } finally {
        setLoading(false, "connectBtn");
    }
}

async function handleStake() {
    if (!state.account) return connectWallet();
    
    const amountStr = document.getElementById('stakeAmount').value;
    if (!amountStr || parseFloat(amountStr) <= 0) return notify("Error", "Enter a valid amount.", "warning");

    try {
        setLoading(true, "stakeBtn", "Processing...");
        const amountWei = ethers.utils.parseEther(amountStr);

        // Logic: Path A (BNB)
        if (state.currentAsset.type === 'NATIVE') {
            const tx = await state.contract.stakeNative({ value: amountWei });
            await tx.wait();
        } 
        // Logic: Path B (Token with Auto-Allowance)
        else {
            const token = new ethers.Contract(state.currentAsset.address, TOKEN_ABI, state.signer);
            const allowance = await token.allowance(state.account, CONFIG.vaultAddress);
            
            if (allowance.lt(amountWei)) {
                notify("Approval", "Approving token usage...", "info");
                const appTx = await token.approve(CONFIG.vaultAddress, ethers.constants.MaxUint256);
                await appTx.wait();
            }
            
            const tx = await state.contract.stakeToken(state.currentAsset.address, amountWei);
            await tx.wait();
        }

        notify("Success", "Assets staked successfully!", "success");
        await refreshData();
    } catch (err) {
        console.error(err);
        notify("Transaction Failed", "The transaction was rejected or failed.", "error");
    } finally {
        setLoading(false, "stakeBtn", "STAKE ASSETS");
    }
}

async function handleWithdraw() {
    if (!state.account) return connectWallet();

    try {
        if (state.stakeData.amount.isZero()) throw new Error("No staked balance.");

        // Lock Time Logic
        const now = Math.floor(Date.now() / 1000);
        const unlockAt = state.stakeData.timestamp + CONFIG.lockTime;
        if (now < unlockAt) {
            const diff = unlockAt - now;
            const h = Math.floor(diff / 3600);
            const m = Math.ceil((diff % 3600) / 60);
            throw new Error(`Locked! Available in ${h}h ${m}m.`);
        }

        const tx = await state.contract.withdraw(state.currentAsset.address, state.stakeData.amount);
        await tx.wait();
        notify("Success", "Assets withdrawn!", "success");
        await refreshData();
    } catch (err) {
        notify("Error", err.message, "error");
    }
}

// --- 4. DATA & LIVE COUNTER ---

async function refreshData() {
    if (!state.account) return;
    try {
        // Fetch Wallet Balance
        if (state.currentAsset.type === 'NATIVE') {
            state.walletBalance = await state.provider.getBalance(state.account);
        } else {
            const token = new ethers.Contract(state.currentAsset.address, TOKEN_ABI, state.provider);
            state.walletBalance = await token.balanceOf(state.account);
        }
        document.getElementById('userBalDisplay').innerText = parseFloat(ethers.utils.formatEther(state.walletBalance)).toFixed(4);

        // Fetch Staked Data
        const data = await state.contract.userStakes(state.currentAsset.address, state.account);
        state.stakeData = { amount: data.amount, timestamp: data.lastStakeTime.toNumber() };
        
        startLiveTicker();
    } catch (e) { console.error(e); }
}

function startLiveTicker() {
    if (state.liveInterval) clearInterval(state.liveInterval);
    const display = document.getElementById('stakedBal');
    const base = parseFloat(ethers.utils.formatEther(state.stakeData.amount));
    
    if (base <= 0) return display.innerText = "0.0000";

    const rate = (CONFIG.apy / 100) / 31536000; // APY to per-second rate

    state.liveInterval = setInterval(() => {
        const elapsed = Math.floor(Date.now() / 1000) - state.stakeData.timestamp;
        const total = base + (base * rate * Math.max(0, elapsed));
        display.innerText = total.toFixed(7);
    }, 1000);
}

// --- 5. HELPERS ---

function setInputPercentage(p) {
    if (!state.account) return;
    let amount = state.walletBalance;
    if (state.currentAsset.type === 'NATIVE' && p === 1.0) {
        const buffer = ethers.utils.parseEther(CONFIG.gasBuffer.toString());
        amount = amount.gt(buffer) ? amount.sub(buffer) : ethers.BigNumber.from(0);
    }
    const val = amount.mul(Math.floor(p * 100)).div(100);
    document.getElementById('stakeAmount').value = ethers.utils.formatEther(val);
}

function generateDropdown() {
    const menu = document.getElementById('dropdownMenu');
    menu.innerHTML = ASSETS.map(a => `
        <div class="flex items-center gap-3 p-4 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0" onclick="selectAsset('${a.id}')">
            <img src="${a.icon}" class="w-5 h-5 rounded-full">
            <span class="text-sm font-bold text-gray-200">${a.name}</span>
        </div>
    `).join('');
}

window.selectAsset = (id) => {
    state.currentAsset = ASSETS.find(a => a.id === id);
    document.getElementById('currIcon').src = state.currentAsset.icon;
    document.getElementById('currName').innerText = state.currentAsset.name;
    document.querySelectorAll('.asset-symbol').forEach(el => el.innerText = state.currentAsset.symbol);
    document.getElementById('dropdownMenu').classList.add('hidden');
    refreshData();
};

function setLoading(loading, id, text) {
    state.isProcessing = loading;
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = loading;
    if (loading) el.classList.add('opacity-50'); else el.classList.remove('opacity-50');
}

function notify(title, text, icon) {
    Swal.fire({ title, text, icon, background: '#111', color: '#fff', confirmButtonColor: '#4ade80' });
     }
        
