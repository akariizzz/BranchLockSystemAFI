// 1. Initialize Supabase
const supabaseUrl = 'https://tyviygbikaupasrvcnrx.supabase.co'; 
const supabaseKey = 'sb_publishable_X0R9-R3YnHyvRHhc2a63fQ_0p9Vnxa8';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// Tracks requests for audio alerts - initialized to null to prevent initial login blast
let lastRequestCount = null; 

// 2. Login Logic
async function handleLogin() {
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    const loginErr = document.getElementById('loginError');

    const { data, error } = await supabaseClient
        .from('staff_users')
        .select('full_name, assigned_branch') 
        .eq('username', user)
        .eq('password', pass)
        .maybeSingle();

    if (data) {
        localStorage.setItem('afi_user', data.full_name); 
        localStorage.setItem('afi_branch', data.assigned_branch); 
        window.location.href = 'index.html'; 
    } else {
        loginErr.classList.remove('d-none');
        loginErr.innerHTML = "Invalid username or password.";
    }
}

// 3. Logout Logic
function logout() {
    if (confirm("Are you sure you want to logout?")) {
        localStorage.clear(); 
        window.location.href = 'login.html'; 
    }
}

// 4. Secure Branch Lock & Automatic Request Logic
async function checkAndLock() {
    // FIX: Removed the branchSelect.value call that caused the null error
    const myLoggedBranch = localStorage.getItem('afi_branch'); 
    
    const surname = document.getElementById('surname').value.trim().toUpperCase();
    const firstName = document.getElementById('firstName').value.trim().toUpperCase();
    
    // FIX: Updated to 'middleName' to match your latest HTML input ID
    const midName = document.getElementById('middleName').value.trim().toUpperCase();
    
    const product = document.getElementById('productSelect').value;
    const msgBox = document.getElementById('statusMessage');
    const activeOfficer = localStorage.getItem('afi_user');

    if (!surname || !firstName) {
        alert("Please enter both the Surname and First Name.");
        return;
    }

    msgBox.className = 'mt-3 alert alert-info';
    msgBox.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Verifying borrower status...';
    msgBox.classList.remove('d-none');

    const { data: existing } = await supabaseClient
        .from('borrowers')
        .select('*')
        .eq('surname', surname)
        .eq('first_name', firstName)
        .maybeSingle();

    if (existing) {
        const conflictTime = new Date(existing.locked_at).toLocaleString();
        msgBox.className = 'mt-3 alert alert-warning shadow-sm border-warning';
        msgBox.innerHTML = `
            <div class="d-flex align-items-center">
                <i class="bi bi-exclamation-triangle-fill fs-4 me-3 text-warning"></i>
                <div>
                    <strong>ALREADY LOCKED</strong><br>
                    Locked by: <strong>${existing.branch_name}</strong> branch.<br>
                    <small>By: ${existing.processed_by} on ${conflictTime}</small>
                </div>
            </div>
            <hr>
            <p class="mb-2 small text-dark">Request a transfer to move this borrower to <strong>${myLoggedBranch}</strong>.</p>
            <button onclick="requestUnlock('${existing.id}', '${myLoggedBranch}')" class="btn btn-dark btn-sm w-100 shadow">
                <i class="bi bi-send-fill me-1"></i> SEND UNLOCK REQUEST
            </button>`;
        return;
    }

    const { error: insertError } = await supabaseClient
        .from('borrowers')
        .insert([{ 
            surname: surname, 
            first_name: firstName,
            middle_initial: midName, // Stores the full middle name
            branch_name: myLoggedBranch, 
            processed_by: activeOfficer, 
            product: product,
            locked_at: new Date()
        }]);

    if (!insertError) {
        msgBox.className = 'mt-3 alert alert-success shadow-sm';
        msgBox.innerHTML = `<strong>SUCCESS!</strong> Borrower locked to ${myLoggedBranch}.`;
        document.getElementById('surname').value = '';
        document.getElementById('firstName').value = '';
        document.getElementById('middleName').value = '';
        loadLockedList(); 
        setTimeout(() => msgBox.classList.add('d-none'), 5000);
    }
}

// 5. Request Unlock
async function requestUnlock(borrowerId, requestingBranch) {
    if (!requestingBranch || requestingBranch === "null") {
        alert("Error: Invalid branch session. Please re-login.");
        return;
    }

    const { error } = await supabaseClient
        .from('borrowers')
        .update({ 
            unlock_requested: true, 
            requesting_branch: requestingBranch 
        })
        .eq('id', borrowerId);

    if (!error) {
        const msgBox = document.getElementById('statusMessage');
        msgBox.className = 'mt-3 alert alert-success';
        msgBox.innerHTML = `<strong>REQUEST SENT!</strong> ${requestingBranch} is now requesting this borrower.`;
        loadLockedList();
        setTimeout(() => msgBox.classList.add('d-none'), 5000);
    }
}

// 6. Approve Transfer
async function approveTransfer(borrowerId, targetBranch) {
    const msgBox = document.getElementById('statusMessage');
    
    if (confirm(`Approve transfer to ${targetBranch}?`)) {
        const activeOfficer = localStorage.getItem('afi_user');
        
        const { error } = await supabaseClient
            .from('borrowers')
            .update({ 
                branch_name: targetBranch, 
                unlock_requested: false,
                requesting_branch: null,
                processed_by: activeOfficer, 
                locked_at: new Date()
            })
            .eq('id', borrowerId);

        if (!error) {
            msgBox.className = 'mt-3 alert alert-success shadow-sm border-success';
            msgBox.innerHTML = `<strong><i class="bi bi-check-circle-fill me-2"></i>TRANSFER APPROVED!</strong> Borrower moved to ${targetBranch}.`;
            msgBox.classList.remove('d-none');
            
            loadLockedList();
            setTimeout(() => msgBox.classList.add('d-none'), 5000);
        }
    }
}

// 7. Load List & Bootstrap Notification
async function loadLockedList() {
    const { data: locks, error } = await supabaseClient
        .from('borrowers')
        .select('*')
        .order('locked_at', { ascending: false });

    if (error) return;

    const tableBody = document.getElementById('lockTableBody');
    if (!tableBody) return; 
    tableBody.innerHTML = ''; 

    const myBranch = localStorage.getItem('afi_branch');
    let currentBranchRequests = 0;

    locks.forEach(row => {
        const lockDateTime = new Date(row.locked_at).toLocaleString('en-PH', {
            dateStyle: 'short',
            timeStyle: 'short'
        });

        const fullName = `${row.surname}, ${row.first_name} ${row.middle_initial ? row.middle_initial : ''}`;
        
        let requestInfo = "";
        let approvalBtn = "";

        if (row.unlock_requested && row.requesting_branch) {
            requestInfo = `<br><span class="badge bg-warning text-dark mt-1" style="font-size: 0.7rem;">
                <i class="bi bi-arrow-repeat"></i> REQ BY ${row.requesting_branch}</span>`;
            
            if (row.branch_name === myBranch) {
                currentBranchRequests++;
                approvalBtn = `<button onclick="approveTransfer('${row.id}', '${row.requesting_branch}')" 
                                class="btn btn-success btn-sm mt-2 d-block w-100 shadow-sm" style="font-size: 0.75rem;">
                                <i class="bi bi-check-circle-fill"></i> APPROVE TRANSFER
                               </button>`;
            }
        }

        tableBody.innerHTML += `
            <tr>
                <td class="fw-bold text-primary">${fullName}${requestInfo}${approvalBtn}</td>
                <td><span class="badge bg-info text-dark">${row.product || 'N/A'}</span></td>
                <td><span class="badge bg-primary">${row.branch_name}</span></td>
                <td>${row.processed_by || 'N/A'}</td>
                <td><small>${lockDateTime}</small></td>
            </tr>
        `;
    });

    if (lastRequestCount !== null && currentBranchRequests > lastRequestCount) {
        const alertSound = document.getElementById('requestAlert');
        if (alertSound) alertSound.play().catch(() => {});

        const toastEl = document.getElementById('requestToast');
        if (toastEl) {
            const toast = new bootstrap.Toast(toastEl, { delay: 6000 });
            toast.show();
        }
    }
    lastRequestCount = currentBranchRequests;
}

// 8. Search & 9. Refresh Timer
function filterTable() {
    const searchTerm = document.getElementById('tableSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#lockTableBody tr');
    rows.forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(searchTerm) ? '' : 'none';
    });
}

let timeLeft = 30;
function startRefreshTimer() {
    setInterval(async () => {
        const timerElement = document.getElementById('refreshTimer');
        if (!timerElement) return; 
        timeLeft--;
        timerElement.innerText = `Updating in ${timeLeft}s...`;
        if (timeLeft <= 0) {
            await loadLockedList(); 
            timeLeft = 30;
        }
    }, 1000);
}