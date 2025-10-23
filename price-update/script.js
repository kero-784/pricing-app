/*************************************************/
/*          APP CONFIGURATION & GLOBALS          */
/*************************************************/
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzdOrEfpbppE59wZ7_fAYOZwAeSStUSg5NdRG99zC4GrCtNSHl4X2G3SuZxBFgxmdd3Ig/exec";
let database = [];
let entries = [];
const LOCAL_STORAGE_ENTRIES_KEY = 'pricingAppEntries';
const LOCAL_STORAGE_BRANCH_KEY = 'pricingAppBranch';
let autocompleteDebounceTimer;

// Variables to remember values from the calculator
let lastUsedUnitCount = 1;
let lastUsedDiscount = 0;
let lastUsedVat = 0;

let selectedBranch = '';
let activeAlternateSupplier = ''; // NEW: To remember the selected alternate supplier

const BRANCH_NAMES = [
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
        const term = codeInput.value.trim();
        
        getItemDetails(); 

        const exactMatch = database.find(item => String(item.code) === term);
        if (exactMatch) {
            suggestionsBox.style.display = 'none';
            return;
        }

        if (term.length < 1) { suggestionsBox.style.display = 'none'; return; }

        const suggestions = database
            .filter(item => String(item.code).toLowerCase().includes(term.toLowerCase()) || String(item.name).toLowerCase().includes(term.toLowerCase()))
            .slice(0, 10);
            
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
function toggleCurrentPriceField() { document.getElementById('currentPriceDiv').style.display = document.getElementById('type').value === 'مرتجع' ? 'flex' : 'none'; }

// NEW: Function to manage the visibility of the "Clear" button for alternate supplier
function updateAlternateSupplierUI() {
    const clearBtn = document.getElementById('clearAlternateSupplierBtn');
    const altSupplierInput = document.getElementById('alternateSupplierName');
    if (activeAlternateSupplier) {
        clearBtn.style.display = 'inline-block';
        altSupplierInput.placeholder = 'Using active alternate supplier';
    } else {
        clearBtn.style.display = 'none';
        altSupplierInput.placeholder = 'Click button to select';
    }
}

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

    const alternateSupplierName = document.getElementById('alternateSupplierName').value.trim();
    const defaultSupplierName = document.getElementById('supplierName').value.trim();
    const finalSupplier = alternateSupplierName || defaultSupplierName;
    const finalUnitPrice = parseFloat(unitPriceStr);

    const newEntry = {
        code: code,
        name: document.getElementById('name').value.trim(),
        supplier: finalSupplier,
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
    document.getElementById('alternateSupplierName').value = activeAlternateSupplier; // MODIFIED: Pre-fill with active supplier
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
    updateAlternateSupplierUI(); // Ensure UI is correct
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
            <td>${index + 1}</td>
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
    document.getElementById('total-entries').textContent = entries.length;
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
    const dataForExcel = entries.map((e, index) => ({ "#": index + 1, "Code": e.code, "Name": e.name, "Supplier": e.supplier, "Units": e.units, "Discount (%)": e.discount, "VAT (%)": e.vat, "Piece Price": e.piece, "Case Price": e.case, "Type": e.type, "Current Price": e.current }));
    const ws = XLSX.utils.json_to_sheet(dataForExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Entries");
    XLSX.writeFile(wb, (selectedBranch ? selectedBranch + '_' : '') + "pricing_entries.xlsx");
    displayMessage('Exported to Excel!');
}
function exportToJPG() {
    if (entries.length === 0) { displayMessage('No entries to export.', true); return; }

    const table = document.getElementById('entriesTable');
    
    const exportContainer = document.createElement('div');
    exportContainer.style.background = '#ffffff';
    exportContainer.style.padding = '20px';
    exportContainer.style.boxSizing = 'border-box';

    if (selectedBranch) {
        const title = document.createElement('h2');
        title.textContent = `Entries for ${selectedBranch}`;
        title.style.textAlign = 'center';
        title.style.marginBottom = '20px';
        title.style.color = '#333';
        exportContainer.appendChild(title);
    }

    const tableClone = table.cloneNode(true);
    
    tableClone.querySelectorAll('thead tr, tbody tr').forEach(row => {
        if (row.lastElementChild) {
            row.removeChild(row.lastElementChild);
        }
    });

    tableClone.style.borderCollapse = 'collapse';
    tableClone.style.width = '100%';
    tableClone.querySelectorAll('th, td').forEach(cell => {
        cell.style.border = '1px solid #ddd';
        cell.style.padding = '8px';
    });
    tableClone.querySelector('thead').style.backgroundColor = '#e9ecef';
    tableClone.querySelector('tfoot').style.backgroundColor = '#f2f2f2';

    exportContainer.appendChild(tableClone);
    document.body.appendChild(exportContainer);

    html2canvas(exportContainer, { scale: 2, useCORS: true, logging: false }).then(canvas => {
        const link = document.createElement('a'); link.href = canvas.toDataURL('image/jpeg', 0.9);
        link.download = (selectedBranch ? selectedBranch + '_' : '') + 'entries_table.jpg'; 
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        document.body.removeChild(exportContainer);
        displayMessage('Exported to JPG!');
    }).catch(error => { 
        console.error('JPG Export Error:', error); 
        displayMessage('Error exporting to JPG.', true); 
        if (document.body.contains(exportContainer)) {
            document.body.removeChild(exportContainer);
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
    const openPopups = document.querySelectorAll('.popup-base.show, .modal.show');
    const overlay = document.getElementById('overlay');
    openPopups.forEach(p => {
        if ($(p).hasClass('modal')) {
            $(p).modal('hide');
        } else {
            p.classList.remove('show');
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
let suppliersList = [];

function openSupplierSelectionModal() {
    if (database.length === 0) {
        displayMessage("Database not loaded. Please refresh the database first.", true);
        return;
    }
    suppliersList = [...new Set(database.map(item => (item['supplier name'] || '').trim()).filter(s => s))].sort();
    const supplierSearchInput = document.getElementById('supplierSearchInput');
    supplierSearchInput.value = '';
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
    activeAlternateSupplier = supplierName; // MODIFIED: Set the active supplier
    $('#supplierSelectionModal').modal('hide');
    displayMessage(`Active alternate supplier set to: ${supplierName}`);
    updateAlternateSupplierUI(); // MODIFIED: Update the UI
}

// NEW: Function to clear the active alternate supplier
function clearActiveAlternateSupplier() {
    activeAlternateSupplier = '';
    document.getElementById('alternateSupplierName').value = '';
    displayMessage('Active alternate supplier cleared. Default will now be used.');
    updateAlternateSupplierUI();
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
    $('#branchSelectionModal').modal({ backdrop: 'static', keyboard: false });
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
    const storedBranch = localStorage.getItem(LOCAL_STORAGE_BRANCH_KEY);
    if (storedBranch) {
        selectedBranch = storedBranch;
        document.getElementById('currentBranchDisplay').textContent = selectedBranch;
    } else {
        openBranchSelectionModal();
    }

    loadEntriesFromLocalStorageAndUpdateTable();
    loadDatabase(false);
    calculateMainTotal();
    toggleCurrentPriceField();
    updateAlternateSupplierUI(); // Call on load to set initial state of clear button
    $('[data-toggle="tooltip"]').tooltip();

    document.addEventListener('click', function (event) {
        const suggestionsBox = document.getElementById('autocomplete-suggestions');
        if (!event.target.closest('#code') && !event.target.closest('#autocomplete-suggestions')) {
            suggestionsBox.style.display = 'none';
        }
        if (event.target.closest('.popup-close-btn')) {
            event.preventDefault(); 
            event.stopPropagation();
            closeAllPopups();
        }
    });

    $('#supplierSearchInput').on('input', function() {
        renderSupplierList(this.value);
    });
});
