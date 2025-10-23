/*************************************************/
/*          APP CONFIGURATION & GLOBALS          */
/*************************************************/
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzdOrEfpbppE59wZ7_fAYOZwAeSStUSg5NdRG99zC4GrCtNSHl4X2G3SuZxBFgxmdd3Ig/exec";
let database = [];
let entries = [];
const LOCAL_STORAGE_ENTRIES_KEY = 'pricingAppEntries';
const LOCAL_STORAGE_BRANCH_KEY = 'pricingAppBranch'; // New: Key for branch name
let autocompleteDebounceTimer;

// Variables to remember values from the calculator
let lastUsedUnitCount = 1;
let lastUsedDiscount = 0;
let lastUsedVat = 0;

let selectedBranch = ''; // New: To store the selected branch name

const BRANCH_NAMES = [ // New: Predefined branch names
    "جاردنز السخنة", "تلال السخنة", "ستلا", "دبلو", "تلال الساحل",
    "سوان ليك", "كسكادا", "لافيستا باي", "لافيستا راس الحكمة",
    "لازوردي باي", "نادي هليوبوليس", "بالم هيلز", "القطامية",
    "العاصمة", "فوكا", "مخزن بلبيس", "مخزن الساحل"
];

/*************************************************/
/*     DATABASE & INITIALIZATION FUNCTIONS       */
/*************************************************/
async function loadDatabase(force = false) {
    const indicator = force ? document.getElementById('refresh-indicator') : document.getElementById('loading-indicator');
    indicator.style.display = force ? 'block' : 'flex';
    if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL.includes("PASTE_YOUR")) {
        displayMessage("API URL is not configured in the script.", true);
        indicator.style.display = 'none';
        return;
    }
    try {
        const url = `${GAS_WEB_APP_URL}?action=getItemDatabase` + (force ? `&force=true&t=${new Date().getTime()}` : '');
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Network error: ${response.statusText}`);
        const result = await response.json();
        if (result.success) {
            database = result.data;
            displayMessage(force ? 'Database refreshed successfully!' : 'Database loaded successfully from API!');
        } else { throw new Error(result.error || 'An unknown API error occurred.'); }
    } catch (error) {
        console.error('Error loading database from API:', error);
        displayMessage(`Error loading database: ${error.message}.`, true);
    } finally {
        if (force) { setTimeout(() => { indicator.style.display = 'none'; }, 500); } 
        else { indicator.style.display = 'none'; }
    }
}
function refreshDatabase() { loadDatabase(true); }
async function clearDatabase() {
    if (confirm("Are you sure you want to clear the locally loaded database? This will require a refresh to fetch it again.")) {
        database = [];
        displayMessage('In-memory database cleared!');
        const popupTableBody = document.querySelector('#databasePopup #databaseTable tbody');
        if (popupTableBody) {
            popupTableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Database is empty.</td></tr>';
        }
    }
}

/*************************************************/
/*      AUTOCOMPLETE & UI HELPERS                */
/*************************************************/
function handleCodeInput() {
    clearTimeout(autocompleteDebounceTimer);
    autocompleteDebounceTimer = setTimeout(() => {
        const codeInput = document.getElementById('code');
        const suggestionsBox = document.getElementById('autocomplete-suggestions');
        const term = codeInput.value.trim(); // Keep original casing for exact match
        getItemDetails(); // This function will find based on exact match

        if (term.length < 1) { suggestionsBox.style.display = 'none'; return; }

        // Prioritize exact code match
        const exactMatch = database.find(item => String(item.code) === term);
        let suggestions = [];

        if (exactMatch) {
            suggestions.push(exactMatch);
        } else {
            // Then partial matches for code or name
            suggestions = database
                .filter(item => (String(item.code).toLowerCase().includes(term.toLowerCase()) || String(item.name).toLowerCase().includes(term.toLowerCase())) && String(item.code) !== term) // Exclude exact match if it was already added
                .slice(0, 9); // Get up to 9 more suggestions
            if (exactMatch) suggestions.unshift(exactMatch); // Add exact match to the top
        }
        
        // Limit total suggestions
        suggestions = suggestions.slice(0, 10);

        if (suggestions.length > 0) {
            suggestionsBox.innerHTML = suggestions.map(s =>
                `<div style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #eee;" onmouseover="this.style.backgroundColor='#f0f0f0'" onmouseout="this.style.backgroundColor='white'" onclick="selectAutocompleteItem('${s.code}')">
                    <strong>${s.code}</strong> - ${s.name}
                </div>`
            ).join('');
            suggestionsBox.style.display = 'block';
        } else { suggestionsBox.style.display = 'none'; }
    }, 250);
}

function selectAutocompleteItem(code) {
    document.getElementById('code').value = code;
    document.getElementById('autocomplete-suggestions').style.display = 'none';
    getItemDetails();
    document.getElementById('unitPrice').focus();
}

function getItemDetails() {
    const code = document.getElementById('code').value.trim();
    document.getElementById('name').value = '';
    document.getElementById('supplierName').value = '';
    if (!code) return;
    const foundItem = database.find(item => String(item.code) === code);
    if (foundItem) {
        document.getElementById('name').value = foundItem.name || '';
        document.getElementById('supplierName').value = foundItem['supplier name'] || '';
    }
}
function displayMessage(message, isError = false) {
    const messageContainer = document.getElementById('message-container');
    messageContainer.textContent = message;
    messageContainer.className = isError ? 'error show' : 'show';
    setTimeout(() => { messageContainer.classList.remove('show'); }, 3000);
}
function displayError(elementId, message) { const el = document.getElementById(elementId); if (el) el.textContent = message; }
function clearError(elementId) { const el = document.getElementById(elementId); if (el) el.textContent = ''; }
function toggleAlternateSupplier() { 
    const alternateSupplierChecked = document.getElementById('alternateSupplierCheck').checked;
    document.getElementById('alternateSupplierDiv').style.display = alternateSupplierChecked ? 'flex' : 'none'; 
    document.getElementById('selectSupplierButton').style.display = alternateSupplierChecked ? 'inline-block' : 'none'; // New: Show/hide select supplier button
    if (!alternateSupplierChecked) {
        document.getElementById('alternateSupplierName').value = ''; // Clear if unchecked
    }
}
function toggleCurrentPriceField() { document.getElementById('currentPriceDiv').style.display = document.getElementById('type').value === 'مرتجع' ? 'flex' : 'none'; }

/*************************************************/
/*      CALCULATOR MODAL LOGIC                   */
/*************************************************/
function openCalculatorModal() {
    document.getElementById('modalCost').value = '';
    document.getElementById('modalUnit').value = '1';
    document.getElementById('modalDiscount').value = '0';
    document.getElementById('modalVat').value = '0';
    calculateInModal();
    $('#calculatorModal').modal('show');
}
function calculateInModal() {
    const cost = parseFloat(document.getElementById('modalCost').value) || 0;
    const unit = parseInt(document.getElementById('modalUnit').value) || 0;
    const discount = parseFloat(document.getElementById('modalDiscount').value) || 0;
    const vatRate = parseFloat(document.getElementById('modalVat').value) || 0;
    if (cost < 0 || unit <= 0 || discount < 0) {
        document.getElementById('modalUnitPriceResult').value = 'Invalid Input';
        document.getElementById('modalCasePriceResult').value = 'Invalid Input';
        return;
    }
    const discountedCost = cost * (1 - discount / 100);
    const finalCasePrice = discountedCost * (1 + vatRate / 100);
    const finalUnitPrice = (unit > 0) ? (finalCasePrice / unit) : 0;
    document.getElementById('modalUnitPriceResult').value = finalUnitPrice.toFixed(3);
    document.getElementById('modalCasePriceResult').value = finalCasePrice.toFixed(3);
}
function applyCalculatorPrice() {
    const calculatedUnitPrice = document.getElementById('modalUnitPriceResult').value;
    lastUsedUnitCount = parseInt(document.getElementById('modalUnit').value) || 1;
    lastUsedDiscount = parseFloat(document.getElementById('modalDiscount').value) || 0;
    lastUsedVat = parseFloat(document.getElementById('modalVat').value) || 0;
    document.getElementById('unitPrice').value = calculatedUnitPrice;
    $('#calculatorModal').modal('hide');
    calculateMainTotal();
}

/*************************************************/
/*      MAIN FORM PRICING & DATA HANDLING        */
/*************************************************/
function calculateMainTotal() {
    clearError('unitPriceError');
    const unitPrice = parseFloat(document.getElementById('unitPrice').value) || 0;
    if (unitPrice < 0) { 
        displayError('unitPriceError', 'Price must be non-negative');
        return;
    }
    // This function now only serves to validate the unit price on input.
}

function addToList() {
    let isValid = true;
    clearError('codeError');
    clearError('unitPriceError');
    clearError('currentPriceError');
    const code = document.getElementById('code').value.trim();
    const unitPriceStr = document.getElementById('unitPrice').value;
    const type = document.getElementById('type').value;

    if (!code) { displayError('codeError', 'Code is required.'); isValid = false; }
    if (unitPriceStr === '' || isNaN(parseFloat(unitPriceStr)) || parseFloat(unitPriceStr) < 0) {
        displayError('unitPriceError', 'Valid unit price is required.'); isValid = false;
    }

    const currentPriceInput = document.getElementById('currentPrice').value;
    let currentFormatted = '';
    if (type === 'مرتجع') {
        if (currentPriceInput === '' || isNaN(parseFloat(currentPriceInput)) || parseFloat(currentPriceInput) < 0) {
            displayError('currentPriceError', 'Valid current price required.'); isValid = false;
        } else { currentFormatted = parseFloat(currentPriceInput).toFixed(3); }
    }

    if (!isValid) { displayMessage('Please correct errors before saving.', true); return; }

    const alternateSupplierCheck = document.getElementById('alternateSupplierCheck').checked;
    const alternateSupplierName = document.getElementById('alternateSupplierName').value.trim();
    const finalUnitPrice = parseFloat(unitPriceStr);

    const newEntry = {
        code: code,
        name: document.getElementById('name').value.trim(),
        supplier: alternateSupplierCheck && alternateSupplierName ? alternateSupplierName : document.getElementById('supplierName').value.trim(),
        units: lastUsedUnitCount,
        discount: lastUsedDiscount,
        vat: lastUsedVat,
        piece: finalUnitPrice.toFixed(3),
        case: (finalUnitPrice * lastUsedUnitCount).toFixed(3),
        type: type,
        current: currentFormatted
    };
    entries.push(newEntry);
    saveEntriesToLocalStorage();
    updateEntriesTable();
    displayMessage('Item added to local list.');
    clearInputFields();
}

function clearInputFields() {
    document.getElementById('code').value = '';
    document.getElementById('name').value = '';
    document.getElementById('supplierName').value = '';
    document.getElementById('alternateSupplierCheck').checked = false;
    document.getElementById('alternateSupplierName').value = '';
    document.getElementById('alternateSupplierDiv').style.display = 'none';
    document.getElementById('selectSupplierButton').style.display = 'none'; // New: Hide select supplier button
    document.getElementById('unitPrice').value = '';
    document.getElementById('currentPrice').value = '';
    document.getElementById('type').value = 'شراء';
    lastUsedUnitCount = 1;
    lastUsedDiscount = 0;
    lastUsedVat = 0;
    document.getElementById('modalCost').value = '';
    toggleCurrentPriceField();
    clearError('codeError');
    clearError('unitPriceError');
    clearError('currentPriceError');
    document.getElementById('code').focus();
}


/*************************************************/
/*      ENTRIES TABLE & EXPORT FUNCTIONS         */
/*************************************************/
function loadEntriesFromLocalStorage() { return JSON.parse(localStorage.getItem(LOCAL_STORAGE_ENTRIES_KEY) || '[]'); }
function saveEntriesToLocalStorage() { localStorage.setItem(LOCAL_STORAGE_ENTRIES_KEY, JSON.stringify(entries)); }
function loadEntriesFromLocalStorageAndUpdateTable() { entries = loadEntriesFromLocalStorage(); updateEntriesTable(); }
function updateEntriesTable() {
    const tableBody = document.querySelector('#entriesTable tbody');
    const oldRowCount = tableBody.rows.length;
    tableBody.innerHTML = entries.map((entry, index) => `
        <tr data-index="${index}">
            <td>${entry.code}</td><td>${entry.name}</td>
            <td>${entry.supplier}</td><td>${entry.units}</td>
            <td>${entry.discount}</td><td>${entry.vat}</td>
            <td>${entry.piece}</td><td>${entry.case}</td>
            <td>${entry.type}</td><td>${entry.current}</td>
            <td>
                <button class="btn btn-danger btn-sm" onclick="deleteLocalEntry(${index})" title="Delete Entry" data-toggle="tooltip" data-placement="top">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>`
    ).join('');
    if (entries.length > 0 && tableBody.rows.length > oldRowCount) {
        const lastRow = tableBody.rows[tableBody.rows.length - 1];
        lastRow.style.backgroundColor = '#d4edda';
        setTimeout(() => {
            lastRow.style.transition = 'background-color 0.5s ease';
            lastRow.style.backgroundColor = '';
            setTimeout(() => lastRow.style.transition = '', 500);
        }, 100);
    }
    updateTableSummary();
    $('#entriesTable [data-toggle="tooltip"]').tooltip();
}
function updateTableSummary() {
    const totalEntries = entries.length;
    // Removed grand total case calculation as per request
    document.getElementById('total-entries').textContent = totalEntries;
    // document.getElementById('grand-total-case').textContent = grandTotalCase.toFixed(3); // Removed this line
}
function deleteLocalEntry(index) {
    $(`[data-index=${index}] [data-toggle="tooltip"]`).tooltip('hide');
    if (confirm("Delete this entry from the local list?")) {
        entries.splice(index, 1);
        saveEntriesToLocalStorage();
        updateEntriesTable();
        displayMessage('Entry deleted.');
    }
}
function clearAll() {
    if (confirm("Clear all local entries?")) {
        localStorage.removeItem(LOCAL_STORAGE_ENTRIES_KEY);
        entries = [];
        updateEntriesTable();
        displayMessage('All local entries cleared.');
    }
}
function exportToExcel() {
    if (entries.length === 0) { displayMessage('No entries to export.', true); return; }
    const dataForExcel = entries.map(e => ({ "Code": e.code, "Name": e.name, "Supplier": e.supplier, "Units": e.units, "Discount (%)": e.discount, "VAT (%)": e.vat, "Piece Price": e.piece, "Case Price": e.case, "Type": e.type, "Current Price": e.current }));
    const ws = XLSX.utils.json_to_sheet(dataForExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Entries");
    XLSX.writeFile(wb, (selectedBranch ? selectedBranch + '_' : '') + "pricing_entries.xlsx"); // Added branch name to filename
    displayMessage('Exported to Excel!');
}
function exportToJPG() {
    if (entries.length === 0) { displayMessage('No entries to export.', true); return; }

    const table = document.getElementById('entriesTable');
    
    // Create a temporary div to prepend the title
    const exportContainer = document.createElement('div');
    exportContainer.style.background = '#ffffff'; // Ensure white background for the export
    exportContainer.style.padding = '20px'; // Some padding
    exportContainer.style.boxSizing = 'border-box'; // Include padding in width/height

    if (selectedBranch) {
        const title = document.createElement('h2');
        title.textContent = `Entries for ${selectedBranch}`;
        title.style.textAlign = 'center';
        title.style.marginBottom = '20px';
        title.style.color = '#333'; // Darker text for readability
        exportContainer.appendChild(title);
    }

    // Clone the table to avoid modifying the live DOM
    const tableClone = table.cloneNode(true);
    // Remove the last column (Actions) from the clone for export
    tableClone.querySelectorAll('th:last-child, td:last-child').forEach(el => el.remove());
    // Ensure table styles are applied (e.g., borders) for the clone
    tableClone.style.borderCollapse = 'collapse';
    tableClone.style.width = '100%';
    tableClone.querySelectorAll('th, td').forEach(cell => {
        cell.style.border = '1px solid #ddd';
        cell.style.padding = '8px';
    });
    tableClone.querySelector('thead th').style.background = '#e9ecef'; // Apply header background
    tableClone.querySelector('tfoot').style.background = '#f2f2f2'; // Apply footer background

    exportContainer.appendChild(tableClone);
    document.body.appendChild(exportContainer); // Append to body to render for html2canvas

    html2canvas(exportContainer, { 
        scale: 2, 
        useCORS: true,
        logging: false, // Suppress logging
        onclone: (clonedDoc) => {
            // Ensure any tooltips are hidden in the cloned document
            $(clonedDoc).find('[data-toggle="tooltip"]').tooltip('dispose');
        }
    }).then(canvas => {
        const link = document.createElement('a'); link.href = canvas.toDataURL('image/jpeg', 0.9);
        link.download = (selectedBranch ? selectedBranch + '_' : '') + 'entries_table.jpg'; 
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        document.body.removeChild(exportContainer); // Clean up the temporary container
        displayMessage('Exported to JPG!');
    }).catch(error => { 
        console.error('JPG Export Error:', error); 
        displayMessage('Error exporting to JPG.', true); 
        if (document.body.contains(exportContainer)) {
            document.body.removeChild(exportContainer); // Ensure cleanup even on error
        }
    });
}

/*************************************************/
/*             POPUP LOGIC (Generic)             */
/*************************************************/
function openPopup(popupId) {
    const popup = document.getElementById(popupId);
    const overlay = document.getElementById('overlay');
    if (!popup || !overlay) return;
    popup.classList.add('show');
    overlay.classList.add('show');
    document.body.classList.add('popup-open');
    overlay.addEventListener('click', closeAllPopups);
    document.addEventListener('keydown', handleEscKey);
}
function closeAllPopups() {
    const openPopups = document.querySelectorAll('.popup-base.show, .modal.show'); // Also close Bootstrap modals
    const overlay = document.getElementById('overlay');
    openPopups.forEach(p => {
        p.classList.remove('show');
        if ($(p).hasClass('modal')) { // For Bootstrap modals, use their hide method
            $(p).modal('hide');
        }
    });
    if (overlay) {
        overlay.classList.remove('show');
        overlay.removeEventListener('click', closeAllPopups);
    }
    document.body.classList.remove('popup-open');
    document.removeEventListener('keydown', handleEscKey);
}
function handleEscKey(event) { if (event.key === 'Escape') { closeAllPopups(); } }
function viewDatabase() {
    const tableBody = document.querySelector('#databasePopup #databaseTable tbody');
    tableBody.innerHTML = '';
    if (database.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Database is empty or not loaded.</td></tr>';
    } else {
        database.forEach(item => {
            const row = tableBody.insertRow();
            row.insertCell().textContent = item.code || '';
            row.insertCell().textContent = item.name || '';
            row.insertCell().textContent = item['supplier name'] || '';
        });
    }
    openPopup('databasePopup');
}

/*************************************************/
/*       SUPPLIER SELECTION POPUP LOGIC          */
/*************************************************/
let suppliersList = []; // To store unique suppliers

function openSupplierSelectionModal() {
    if (database.length === 0) {
        displayMessage("Database not loaded. Please refresh the database first.", true);
        return;
    }
    // Get unique supplier names from the database
    suppliersList = [...new Set(database.map(item => (item['supplier name'] || '').trim()).filter(s => s))].sort();

    const supplierSearchInput = document.getElementById('supplierSearchInput');
    supplierSearchInput.value = ''; // Clear previous search
    renderSupplierList('');
    
    $('#supplierSelectionModal').modal('show');
}

function renderSupplierList(searchTerm) {
    const supplierListBody = document.querySelector('#supplierSelectionModal #supplierList tbody');
    supplierListBody.innerHTML = '';
    const lowerCaseSearchTerm = searchTerm.toLowerCase();

    const filteredSuppliers = suppliersList.filter(supplier =>
        supplier.toLowerCase().includes(lowerCaseSearchTerm)
    );

    if (filteredSuppliers.length === 0) {
        supplierListBody.innerHTML = '<tr><td colspan="1" style="text-align:center;">No suppliers found.</td></tr>';
    } else {
        filteredSuppliers.forEach(supplier => {
            const row = supplierListBody.insertRow();
            const cell = row.insertCell();
            cell.textContent = supplier;
            cell.style.cursor = 'pointer';
            cell.style.padding = '8px 12px';
            cell.onmouseover = function() { this.style.backgroundColor = '#f0f0f0'; };
            cell.onmouseout = function() { this.style.backgroundColor = 'white'; };
            cell.onclick = function() { selectSupplier(supplier); };
        });
    }
}

function selectSupplier(supplierName) {
    document.getElementById('alternateSupplierName').value = supplierName;
    $('#supplierSelectionModal').modal('hide');
    displayMessage(`Selected supplier: ${supplierName}`);
}

/*************************************************/
/*         BRANCH SELECTION MODAL LOGIC          */
/*************************************************/
function openBranchSelectionModal() {
    const branchListBody = document.querySelector('#branchSelectionModal #branchList tbody');
    branchListBody.innerHTML = '';
    BRANCH_NAMES.forEach(branch => {
        const row = branchListBody.insertRow();
        const cell = row.insertCell();
        cell.textContent = branch;
        cell.style.cursor = 'pointer';
        cell.style.padding = '8px 12px';
        cell.onmouseover = function() { this.style.backgroundColor = '#f0f0f0'; };
        cell.onmouseout = function() { this.style.backgroundColor = 'white'; };
        cell.onclick = function() { selectBranch(branch); };
    });
    // Use Bootstrap's modal method directly for the branch modal
    $('#branchSelectionModal').modal({ backdrop: 'static', keyboard: false }); // Prevent closing without selection
    $('#branchSelectionModal').modal('show');
}

function selectBranch(branchName) {
    selectedBranch = branchName;
    localStorage.setItem(LOCAL_STORAGE_BRANCH_KEY, branchName);
    document.getElementById('currentBranchDisplay').textContent = selectedBranch;
    $('#branchSelectionModal').modal('hide');
    displayMessage(`Branch selected: ${selectedBranch}`);
}

/*************************************************/
/*      APP INITIALIZATION (jQuery Standard)     */
/*************************************************/
$(document).ready(function() {
    // Load branch first
    const storedBranch = localStorage.getItem(LOCAL_STORAGE_BRANCH_KEY);
    if (storedBranch) {
        selectedBranch = storedBranch;
        document.getElementById('currentBranchDisplay').textContent = selectedBranch;
    } else {
        openBranchSelectionModal(); // Prompt for branch if not set
    }

    loadEntriesFromLocalStorageAndUpdateTable();
    loadDatabase(false);
    calculateMainTotal();
    toggleCurrentPriceField();
    toggleAlternateSupplier(); // Initialize the visibility of selectSupplierButton
    $('[data-toggle="tooltip"]').tooltip();

    document.addEventListener('click', function (event) {
        const suggestionsBox = document.getElementById('autocomplete-suggestions');
        if (!event.target.closest('#code') && !event.target.closest('#autocomplete-suggestions')) {
            suggestionsBox.style.display = 'none';
        }
        // No longer explicitly closing popups via this listener for Bootstrap modals,
        // as Bootstrap's data-dismiss handles it. Keep for custom popups if any.
        if (event.target.closest('.popup-close-btn')) {
            event.preventDefault(); 
            event.stopPropagation();
            closeAllPopups(); // This will handle the custom databasePopup
        }
    });

    // Event listener for supplier search input
    $('#supplierSearchInput').on('input', function() {
        renderSupplierList(this.value);
    });
});
