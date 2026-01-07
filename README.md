# Update Data NIPNAS

Script untuk update data NIPNAS di PostgreSQL dari file Excel.

## Installation

```bash
npm install
```

## Configuration

Copy file `.env.example` ke `.env` dan sesuaikan dengan konfigurasi database Anda:

```bash
cp .env.example .env
```

Edit file `.env` dengan kredensial database Anda.

## Format Excel

File Excel harus memiliki 3 kolom:

| NIK              | CA_NAME    | KOREKSI NIPNAS |
|------------------|------------|----------------|
| 1234567890123456 | JOHN DOE   | 111111         |
| 6543210987654321 | JANE SMITH | 222222         |

## Usage

### 1. Buat Sample Excel

```bash
node create_sample_excel.js
```

File `sample_nipnas_data.xlsx` akan dibuat. Ganti data NIK dan CA_NAME dengan data yang ada di database.

### 2. Test (1 Data)

```bash
node update_data_nipnas.js test
```

Edit test data di [update_data_nipnas.js:510-514](update_data_nipnas.js#L510-L514) sesuai data Anda.

### 3. Dry Run (Simulasi)

```bash
node update_data_nipnas.js batch sample_nipnas_data.xlsx --dry-run
```

Cek data tanpa update sebenarnya.

### 4. Update Data

```bash
node update_data_nipnas.js batch sample_nipnas_data.xlsx
```

⚠️ **Warning**: Ini akan update database sebenarnya!

## Output

Script akan menampilkan progress dan menyimpan hasil ke file JSON `update_results_[timestamp].json`.

## Troubleshooting

### Connection refused
Pastikan PostgreSQL berjalan dan konfigurasi `.env` benar.

### Missing columns error
Pastikan file Excel memiliki kolom: NIK, CA_NAME, KOREKSI NIPNAS.

### Data not found
NIK dan CA_NAME tidak ada di database. Cek data di Excel.

### Module not found
Jalankan `npm install`.

## Notes

- Selalu gunakan `--dry-run` terlebih dahulu sebelum update sebenarnya
- Backup database sebelum update massal
- Hasil update disimpan di file JSON untuk audit trail
- Set `DB_DEBUG=true` di `.env` untuk debug mode