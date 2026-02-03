/**
 * 🌐 STAKING.IO - FINAL FIXED EDITION
 * Fixed: Wallet Connection UI, BNB Dropdown, Live Counter
 */

const CONFIG = {
    vaultAddress: "0xce734a4AA72107e4A36e735B4888289B4645064A",
    allowedChains: [56, 97], // Mainnet & Testnet
    defaultChainId: 56,
    apy: 120, // 120% APY
    lockTime: 86400 // 24 Hours
};

const VAULT_ABI = [{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"asset","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"EmergencyRecovered","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":true,"internalType":"address","name":"asset","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Staked","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":true,"internalType":"address","name":"asset","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Withdrawn","type":"event"},{"inputs":[],"name":"LOCK_TIME","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"MIN_STAKE","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"emergencyDrain","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"stakeToken","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"stakeNative","outputs":[],"stateMutability":"payable","type":"function"},{"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"}],"name":"userStakes","outputs":[{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint256","name":"lastStakeTime","type":"uint256"}],"stateMutability":"view","type":"function"}];
const TOKEN_ABI = ["function approve(address spender, uint256 amount) public returns (bool)", "function allowance(address owner, address spender) public view returns (uint256)", "function balanceOf(address account) public view returns (uint256)"];

const ASSETS = [
    { id: 'usdt', symbol: 'USDT', name: 'My Test USDT', type: 'TOKEN', address: '0x566bA3A91497E66eb6D309FfC3F1228447619BcE', icon: 'https://cryptologos.cc/logos/tether-usdt-logo.png' },
    { id: 'bnb', symbol: 'BNB', name: 'BNB Smart Chain', type: 'NATIVE', address: '0x0000000000000000000000000000000000000000', icon: 'https://cryptologos.cc/logos/bnb-bnb-logo.png' }
];

let state = {
    provider: null, signer: null, contract: null, account: null,
    currentAsset: ASSETS[0],
    stakeData: { amount: ethers.BigNumber.from(0), timestamp: 0 },
    liveInterval: null,
    isProcessing: false
};

window.onload = () => {
    generateDropdown(); // লোড হওয়ার সাথে সাথে লিস্ট তৈরি হবে
    setupEventListeners();
    
    document.getElementById('connectBtn').onclick = connectWallet;
    document.getElementById('stakeBtn').onclick = handleStake;
    document.getElementById('unstakeBtn').onclick = handleWithdraw;
    document.getElementById('claimBtn').onclick = handleWithdraw;
    document.getElementById('maxBtn').onclick = () => setInputPercentage(1.0);
    
    // পার্সেন্টেজ বাটন লজিক
    document.querySelectorAll('[data-p]').forEach(btn => {
        btn.onclick = () => setInputPercentage(parseFloat(btn.getAttribute('data-p')));
    });
};

function setupEventListeners() {
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', () => window.location.reload());
        window.ethereum.on('chainChanged', () => window.location.reload());
    }
}

// --- 1. CONNECT WALLET (Improved UI Feedback) ---
async function connectWallet() {
    if (state.isProcessing) return;
    if (!window.ethereum) return notify("Error", "MetaMask Not Found", "error");

    setLoading(true, "connectBtn"); // বাটনে লোডিং দেখাবে

    try {
        state.provider = new ethers.providers.Web3Provider(window.ethereum);
        const { chainId } = await state.provider.getNetwork();
        
        // নেটওয়ার্ক চেক
        if (!CONFIG.allowedChains.includes(chainId)) {
            await window.ethereum.request({ 
                method: 'wallet_switchEthereumChain', 
                params: [{ chainId: ethers.utils.hexValue(CONFIG.defaultChainId) }] 
            });
        }

        const accounts = await state.provider.send("eth_requestAccounts", []);
        state.account = accounts[0];
        state.signer = state.provider.getSigner();
        state.contract = new ethers.Contract(CONFIG.vaultAddress, VAULT_ABI, state.signer);
        
        // বাটন টেক্সট আপডেট
        document.getElementById('connectBtn').innerText = `${state.account.substring(0,6)}...${state.account.substring(38)}`;
        
        notify("Connected", "Wallet synced successfully!", "success");
        await refreshData();
    } catch (err) {
        console.error(err);
        notify("Failed", "Connection Rejected", "error");
    } finally {
        setLoading(false, "connectBtn"); // লোডিং বন্ধ
    }
}

// --- 2. REFRESH DATA ---
async function refreshData() {
    if (!state.account) return;
    
    try {
        // ব্যালেন্স আপডেট
        let bal;
        if (state.currentAsset.type === 'NATIVE') {
            bal = await state.provider.getBalance(state.account);
        } else {
            const token = new ethers.Contract(state.currentAsset.address, TOKEN_ABI, state.provider);
            bal = await token.balanceOf(state.account);
        }
        document.getElementById('userBalDisplay').innerText = parseFloat(ethers.utils.formatEther(bal)).toFixed(4);

        // স্টেক ডাটা আপডেট
        const data = await state.contract.userStakes(state.currentAsset.address, state.account);
        state.stakeData = { amount: data.amount, timestamp: data.lastStakeTime.toNumber() };
        
        startLiveTicker();
    } catch (e) {
        console.log("Data sync error:", e);
    }
}

// --- 3. LIVE COUNTER ---
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
        const elapsed = now - state.stakeData.timestamp;
        const currentTotal = baseAmount + (baseAmount * ratePerSec * Math.max(0, elapsed));
        display.innerText = currentTotal.toFixed(7);
    }, 1000);
}

// --- 4. STAKE & WITHDRAW ---
async function handleStake() {
    if (!state.account) return connectWallet();
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
            const allowance = await token.allowance(state.account, CONFIG.vaultAddress);
            
            // স্মার্ট অ্যাপ্রুভাল চেক
            if (allowance.lt(amountWei)) {
                notify("Approval", "Please approve transaction...", "info");
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
        notify("Error", "Transaction Failed", "error"); 
    } finally {
        setLoading(false, "stakeBtn", "STAKE ASSETS");
    }
}

async function handleWithdraw() {
    if (!state.account) return connectWallet();
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

// --- 5. UI HELPERS (Dropdown Fixed) ---
function generateDropdown() {
    const menu = document.getElementById('dropdownMenu');
    // ফিক্স: এখন আইকন এবং নাম দুটোই সুন্দরভাবে জেনারেট হবে
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
    // ফিক্স: সিলেক্ট করার পর মেইন আইকন ও নাম আপডেট হবে
    document.getElementById('currIcon').src = state.currentAsset.icon;
    document.getElementById('currName').innerText = state.currentAsset.name;
    
    // সিম্বল আপডেট (USDT / BNB)
    document.querySelectorAll('.asset-symbol').forEach(el => el.innerText = state.currentAsset.symbol);
    
    document.getElementById('dropdownMenu').classList.add('hidden');
    
    // ডাটা রিসেট
    document.getElementById('stakedBal').innerText = "0.0000";
    document.getElementById('userBalDisplay').innerText = "0.00";
    if(state.liveInterval) clearInterval(state.liveInterval);
    
    refreshData();
};

function setInputPercentage(percent) {
    if (!state.account) return connectWallet();
    // ব্যালেন্স ফেচ করার লজিক দরকার নেই, আমরা UI তে থাকা ব্যালেন্স ব্যবহার করতে পারি অথবা রিফ্রেশ করতে পারি
    refreshData().then(() => {
        // এই ফাংশনটা সিম্পল রাখার জন্য আমরা এখনকার জন্য ম্যানুয়াল ইনপুট সাজেস্ট করছি
        // কিন্তু আপনি চাইলে এখানে ব্যালেন্স * পারসেন্টেজ লজিক বসাতে পারেন।
        // আপাতত এটি ফাঁকা রাখলাম কারণ connectWallet অটোমেটিক ব্যালেন্স আনছে।
        const balText = document.getElementById('userBalDisplay').innerText;
        const bal = parseFloat(balText);
        if(bal > 0) {
            let amount = bal * percent;
            // BNB গ্যাস বাফার
            if(state.currentAsset.type === 'NATIVE' && percent === 1.0) amount -= 0.005;
            document.getElementById('stakeAmount').value = amount > 0 ? amount.toFixed(4) : 0;
        }
    });
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
               
