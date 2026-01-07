const XLSX = require('xlsx');
const path = require('path');
require('dotenv').config();

/**
 * Create sample Excel file for testing
 */
function createSampleExcel() {
  // Get column names from environment variables
  const excelColNik = process.env.EXCEL_COLUMN_NIK || 'NIK';
  const excelColCaName = process.env.EXCEL_COLUMN_CA_NAME || 'CA_NAME';
  const excelColKoreksiNipnas = process.env.EXCEL_COLUMN_KOREKSI_NIPNAS || 'KOREKSI NIPNAS';

  // Sample data with dynamic column names
  const data = [
    {
      [excelColNik]: '1234567890123456',
      [excelColCaName]: 'JOHN DOE',
      [excelColKoreksiNipnas]: '111111'
    },
    {
      [excelColNik]: '6543210987654321',
      [excelColCaName]: 'JANE SMITH',
      [excelColKoreksiNipnas]: '222222'
    },
    {
      [excelColNik]: '9876543210123456',
      [excelColCaName]: 'BOB JOHNSON',
      [excelColKoreksiNipnas]: '333333'
    }
  ];

  // Create workbook
  const wb = XLSX.utils.book_new();

  // Create worksheet from data
  const ws = XLSX.utils.json_to_sheet(data);

  // Set column widths
  ws['!cols'] = [
    { wch: 20 }, // NIK
    { wch: 30 }, // CA_NAME
    { wch: 20 }  // KOREKSI NIPNAS
  ];

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Data');

  // Save to file
  const outputPath = path.join(__dirname, 'sample_nipnas_data.xlsx');
  XLSX.writeFile(wb, outputPath);

  console.log(`✓ Sample Excel file created: ${outputPath}`);
  console.log(`\nColumn names used:`);
  console.log(`  - ${excelColNik}`);
  console.log(`  - ${excelColCaName}`);
  console.log(`  - ${excelColKoreksiNipnas}`);
  console.log('\nSample data:');
  console.table(data);
  console.log('\nNote: Ganti data NIK dan CA_NAME dengan data yang ada di database untuk testing.');
  console.log('Note: Nama kolom bisa dikonfigurasi di file .env (EXCEL_COLUMN_*)');
}

// Run if executed directly
if (require.main === module) {
  createSampleExcel();
}

module.exports = { createSampleExcel };
