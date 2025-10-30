// user-management/main.js

// ===================================================================
// ==================== GATEKEEPER SCRIPT ============================
// ===================================================================
(function() {
    const userString = sessionStorage.getItem('keroUser');
    if (!userString) {
        window.location.href = '../login/';
        return;
    }
    try {
        const userData = JSON.parse(userString);
        const permissions = userData.permissions || {};
        if (!permissions['admin'] && !permissions['user-management']) {
            alert("Access Denied: You do not have permission to manage users.");
            window.location.href = '../index.html';
            return;
        }
    } catch (e) {
        sessionStorage.removeItem('keroUser');
        window.location.href = '../login/';
        return;
    }
})();

// ===================================================================
// ============== USER MANAGEMENT APPLICATION LOGIC ==================
// ===================================================================
if (!window.userManagementScriptLoaded) {
    window.userManagementScriptLoaded = true;

    document.addEventListener('DOMContentLoaded', () => {
        const APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyWU8DeLSEkOitYHdRQlE9HcfTfJfL0MPhic3r5rM6ZptgucqPWgH5VkeYtbYjAxnfYnA/exec"; 
        
        const userTableBody = document.querySelector("#userTable tbody");
        const userTableHeader = document.querySelector("#userTable thead");
        const addUserBtn = document.getElementById('addUserBtn');
        const modal = document.getElementById('userModal');
        // ... (other variable declarations remain the same)
        const modalTitle = document.getElementById('modalTitle');
        const userForm = document.getElementById('userForm');
        const closeBtn = document.querySelector('.close-btn');
        const toast = document.getElementById('toast');
        const branchCodeGroup = document.getElementById('branchCodeGroup');
        const passwordHelpText = document.getElementById('passwordHelp');
        const positionGroup = document.getElementById('positionGroup');


        // ==============================================================
        // === NEW HELPER FUNCTION TO DYNAMICALLY RESIZE INPUT FIELDS ===
        // ==============================================================
        /**
         * Finds all text inputs within the user table and sets their `size` 
         * attribute based on the length of their value. This makes the input
         * field visually wide enough to show its content.
         */
        function adjustInputWidths() {
            const inputs = userTableBody.querySelectorAll('input[type="text"]');
            inputs.forEach(input => {
                // Set a minimum size to prevent tiny inputs for empty values
                const minSize = 15;
                const valueLength = input.value.length;
                // Use the greater of the value length or the minimum size
                // Add a small buffer (+1) so the cursor isn't crammed at the end
                input.size = Math.max(valueLength + 1, minSize);
            });
        }
        // ==============================================================


        async function apiRequest(action, method = 'GET', body = null) {
            // ... (apiRequest function remains unchanged)
            const isGet = method.toUpperCase() === 'GET';
            const url = new URL(APP_SCRIPT_URL);

            const options = {
                method: method,
                mode: 'cors',
            };

            if (isGet) {
                url.searchParams.append('action', action);
            } else {
                const payload = body || {};
                payload.action = action;
                options.body = JSON.stringify(payload);
                options.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
            }
            
            try {
                const response = await fetch(url, options);
                if (!response.ok) throw new Error(`Network error: ${response.statusText}`);
                const data = await response.json();
                if (data.status === 'error') throw new Error(data.message);
                return data;
            } catch (error) {
                showToast(error.message, true);
                throw error;
            }
        }

        function renderTable(users, headers) {
            userTableHeader.innerHTML = '';
            userTableBody.innerHTML = '<tr><td colspan="100%">Loading...</td></tr>';
            
            if (!headers.includes('Position')) {
                headers.unshift('Position');
            }

            let headerHtml = '<tr><th>Username</th>';
            headers.forEach(h => headerHtml += `<th>${h.replace(/_/g, ' ')}</th>`);
            headerHtml += '<th>Actions</th></tr>';
            userTableHeader.innerHTML = headerHtml;

            if (users.length === 0) {
                userTableBody.innerHTML = '<tr><td colspan="100%">No users found.</td></tr>';
                return;
            }

            let bodyHtml = '';
            users.forEach(user => {
                bodyHtml += `<tr data-username="${user.username}"><td><strong>${user.username}</strong></td>`;
                headers.forEach(header => {
                    if (header === 'AssignedBranchCode') {
                        const branchCode = user.permissions[header] || '';
                        bodyHtml += `<td><input type="text" class="branch-code-input" value="${branchCode}" placeholder="N/A"></td>`;
                    
                    } else if (header === 'Position') {
                        const position = user.position || ''; 
                        bodyHtml += `<td><input type="text" class="position-input" value="${position}" placeholder="N/A"></td>`;

                    } else {
                        bodyHtml += `<td><input type="checkbox" class="perm-checkbox" data-permission="${header}" ${user.permissions[header] ? 'checked' : ''}></td>`;
                    }
                });
                bodyHtml += `<td class="actions-cell">
                    <button class="btn btn-primary edit-btn" title="Reset Password"><i class="fas fa-key"></i></button>
                    <button class="btn btn-danger delete-btn" title="Delete User"><i class="fas fa-trash"></i></button>
                    </td></tr>`;
            });
            userTableBody.innerHTML = bodyHtml;

            // *** FIXED: Call the adjustment function after rendering the table ***
            adjustInputWidths();
        }

        function showToast(message, isError = false) {
            // ... (showToast function remains unchanged)
            toast.textContent = message;
            toast.className = isError ? 'error' : '';
            toast.classList.add('show');
            setTimeout(() => { toast.classList.remove('show'); }, 3000);
        }

        async function loadUsers() {
            try {
                const data = await apiRequest('getUsers', 'GET');
                renderTable(data.users, data.headers);
            } catch (error) {
                userTableBody.innerHTML = `<tr><td colspan="100%" style="color:red;">${error.message}</td></tr>`;
            }
        }

        async function handleFormSubmit(event) {
            // ... (handleFormSubmit function remains unchanged)
            event.preventDefault();
            const submitBtn = userForm.querySelector('button[type="submit"]');
            const formData = new FormData(userForm);
            const isEditing = !!formData.get('editUsername');
            const username = isEditing ? formData.get('editUsername') : formData.get('username');
            const password = formData.get('password');
            const assignedBranchCode = formData.get('assignedBranchCode');
            const position = formData.get('position');

            let payload = { username: username };
            let action = isEditing ? 'updateUser' : 'addUser';

            if (password) {
                payload.password = password;
            } else if (!isEditing) {
                showToast("Password is required for new users.", true); return;
            }
            
            if (!isEditing) {
                payload.assignedBranchCode = assignedBranchCode;
                payload.position = position;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            try {
                const result = await apiRequest(action, 'POST', payload);
                showToast(result.message);
                closeModal();
                loadUsers();
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Save User';
            }
        }
        
        function handleTableEvents(event) {
            const target = event.target;
            const row = target.closest('tr');
            if (!row || !row.dataset.username) return;
            const username = row.dataset.username;

            // Handle Buttons
            if (target.closest('.edit-btn')) openModal(true, username);
            if (target.closest('.delete-btn')) {
                if (confirm(`Are you sure you want to delete "${username}"?`)) {
                    apiRequest('deleteUser', 'POST', { username: username })
                        .then(loadUsers)
                        .catch(err => console.error("Delete failed:", err));
                }
            }
            // Handle Checkbox clicks
            if (target.classList.contains('perm-checkbox')) {
                // ... (checkbox logic is unchanged)
                const permissions = {};
                row.querySelectorAll('.perm-checkbox').forEach(cb => {
                   permissions[cb.dataset.permission] = cb.checked;
                });
                apiRequest('updateUser', 'POST', { username: username, permissions: permissions })
                    .then(result => showToast(`Permissions updated for ${username}.`))
                    .catch(err => console.error("Permission update failed:", err));
            }
            // Handle text input changes
            if ((target.classList.contains('branch-code-input') || target.classList.contains('position-input')) && event.type === 'change') {
                // *** FIXED: Call adjustment function when a user finishes editing an input ***
                adjustInputWidths(); 
                
                const branchCode = row.querySelector('.branch-code-input').value.trim();
                const position = row.querySelector('.position-input').value.trim();

                let payload = { username: username };
                if (target.classList.contains('branch-code-input')) {
                    payload.assignedBranchCode = branchCode;
                }
                if (target.classList.contains('position-input')) {
                    payload.position = position;
                }

                apiRequest('updateUser', 'POST', payload)
                    .then(result => showToast(`Data updated for ${username}.`))
                    .catch(err => console.error("Data update failed:", err));
            }
        }

        function openModal(isEditing = false, username = '') {
            // ... (openModal function remains unchanged)
            userForm.reset();
            if (isEditing) {
                modalTitle.textContent = `Reset Password for ${username}`;
                document.getElementById('editUsername').value = username;
                document.getElementById('username').value = username;
                document.getElementById('username').readOnly = true;
                document.getElementById('password').required = true;
                passwordHelpText.textContent = "Enter a new password.";
                branchCodeGroup.style.display = 'none';
                positionGroup.style.display = 'none';
            } else {
                modalTitle.textContent = 'Add New User';
                document.getElementById('editUsername').value = '';
                document.getElementById('username').readOnly = false;
                document.getElementById('password').required = true;
                passwordHelpText.textContent = "";
                branchCodeGroup.style.display = 'block';
                positionGroup.style.display = 'block';
            }
            modal.style.display = 'flex';
        }
        function closeModal() { modal.style.display = 'none'; }
        
        // Attach event listeners
        userForm.addEventListener('submit', handleFormSubmit);
        addUserBtn.addEventListener('click', () => openModal());
        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
        
        userTableBody.addEventListener('click', handleTableEvents);
        userTableBody.addEventListener('change', handleTableEvents);

        loadUsers();
    });
}
