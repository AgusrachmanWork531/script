const { Pool } = require('pg');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * Class untuk mengelola koneksi database PostgreSQL
 */
class DatabaseConnection {
    /**
     * Initialize database connection parameters
     * @param {Object} config - Database configuration
     * @param {string} config.host - Database host
     * @param {number} config.port - Database port
     * @param {string} config.database - Database name
     * @param {string} config.user - Database user
     * @param {string} config.password - Database password
     * @param {number} config.max - Maximum number of connections in pool
     * @param {number} config.idleTimeoutMillis - Idle timeout in milliseconds
     */
    constructor(config = {}) {
        this.config = {
            host: config.host || process.env.DB_HOST || 'localhost',
            port: config.port || parseInt(process.env.DB_PORT) || 5432,
            database: config.database || process.env.DB_NAME || '',
            user: config.user || process.env.DB_USER || '',
            password: config.password || process.env.DB_PASSWORD || '',
            max: config.max || parseInt(process.env.DB_MAX_CONNECTIONS) || 10,
            idleTimeoutMillis: config.idleTimeoutMillis || parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
            ssl: config.ssl !== undefined ? config.ssl : (process.env.DB_SSL === 'true'),
        };
        this.pool = null;
        this.debug = process.env.DB_DEBUG === 'true';
    }

    /**
     * Create connection pool
     */
    createConnectionPool() {
        try {
            this.pool = new Pool(this.config);

            this.pool.on('connect', () => {
                if (this.debug) {
                    console.log('New client connected to the pool');
                }
            });

            this.pool.on('error', (err) => {
                console.error('Unexpected error on idle client', err);
            });

            if (this.debug) {
                console.log('Connection pool created successfully');
                console.log('Database config:', {
                    host: this.config.host,
                    port: this.config.port,
                    database: this.config.database,
                    user: this.config.user,
                    ssl: this.config.ssl
                });
            }
            return this.pool;
        } catch (error) {
            console.error('Error while creating connection pool:', error);
            throw error;
        }
    }

    /**
     * Get pool instance
     * @returns {Pool} Pool instance
     */
    getPool() {
        if (!this.pool) {
            this.createConnectionPool();
        }
        return this.pool;
    }

    /**
     * Test database connection
     * @returns {Promise<boolean>} Connection status
     */
    async testConnection() {
        try {
            const pool = this.getPool();
            const client = await pool.connect();
            await client.query('SELECT NOW()');
            client.release();
            console.log('Database connection successful');
            return true;
        } catch (error) {
            console.error('Database connection failed:', error);
            return false;
        }
    }

    /**
     * Close all connections in the pool
     */
    async closeAllConnections() {
        if (this.pool) {
            await this.pool.end();
            console.log('All connections closed');
        }
    }
}

/**
 * Class untuk mengambil data dari database
 */
class DataFetcher {
    /**
     * Initialize DataFetcher
     * @param {DatabaseConnection} dbConnection - Instance dari DatabaseConnection
     */
    constructor(dbConnection) {
        this.db = dbConnection;
    }

    /**
     * Execute SELECT query dan return results sebagai array of objects
     * @param {string} query - SQL query string
     * @param {Array} params - Query parameters (optional)
     * @returns {Promise<Array<Object>>} Array of objects containing query results
     */
    async getData(query, params = []) {
        const pool = this.db.getPool();
        const client = await pool.connect();

        try {
            const result = await client.query(query, params);
            return result.rows;
        } catch (error) {
            console.error('Error fetching data:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get data berdasarkan NIPNAS
     * @param {string} nipnas - NIPNAS value
     * @param {string} tableName - Table name (default: 'your_table')
     * @returns {Promise<Array<Object>>} Array of objects containing matching records
     */
    async getDataByNipnas(nipnas, tableName = 'your_table') {
        const query = `SELECT * FROM ${tableName} WHERE nipnas = $1`;
        return this.getData(query, [nipnas]);
    }

    /**
     * Get all data from a table
     * @param {string} tableName - Name of the table
     * @param {number|null} limit - Maximum number of records to fetch
     * @param {number} offset - Number of records to skip
     * @returns {Promise<Array<Object>>} Array of objects containing records
     */
    async getAllData(tableName, limit = null, offset = 0) {
        let query = `SELECT * FROM ${tableName}`;
        const params = [];

        if (limit !== null) {
            query += ` LIMIT $1 OFFSET $2`;
            params.push(limit, offset);
        }

        return this.getData(query, params);
    }

    /**
     * Execute custom SQL query
     * @param {string} query - SQL query string
     * @param {Array} params - Query parameters (optional)
     * @returns {Promise<Array<Object>>} Array of objects containing query results
     */
    async executeCustomQuery(query, params = []) {
        return this.getData(query, params);
    }

    /**
     * Get single record by ID
     * @param {string} tableName - Table name
     * @param {string|number} id - Record ID
     * @param {string} idColumn - ID column name (default: 'id')
     * @returns {Promise<Object|null>} Single record or null
     */
    async getById(tableName, id, idColumn = 'id') {
        const query = `SELECT * FROM ${tableName} WHERE ${idColumn} = $1`;
        const results = await this.getData(query, [id]);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Get data with WHERE condition
     * @param {string} tableName - Table name
     * @param {Object} conditions - WHERE conditions as key-value pairs
     * @returns {Promise<Array<Object>>} Array of matching records
     */
    async getWhere(tableName, conditions = {}) {
        const keys = Object.keys(conditions);
        if (keys.length === 0) {
            return this.getAllData(tableName);
        }

        const whereClauses = keys.map((key, index) => `${key} = $${index + 1}`);
        const query = `SELECT * FROM ${tableName} WHERE ${whereClauses.join(' AND ')}`;
        const values = Object.values(conditions);

        return this.getData(query, values);
    }

    /**
     * Get count of records
     * @param {string} tableName - Table name
     * @param {Object} conditions - WHERE conditions (optional)
     * @returns {Promise<number>} Count of records
     */
    async getCount(tableName, conditions = {}) {
        const keys = Object.keys(conditions);
        let query = `SELECT COUNT(*) as count FROM ${tableName}`;
        const values = [];

        if (keys.length > 0) {
            const whereClauses = keys.map((key, index) => `${key} = $${index + 1}`);
            query += ` WHERE ${whereClauses.join(' AND ')}`;
            values.push(...Object.values(conditions));
        }

        const result = await this.getData(query, values);
        return parseInt(result[0].count);
    }
}

/**
 * Class untuk membaca file Excel
 */
class ExcelReader {
    /**
     * Read Excel file and return data
     * @param {string} filePath - Path to Excel file
     * @param {string} sheetName - Sheet name (optional, default: first sheet)
     * @returns {Array<Object>} Array of objects from Excel
     */
    static readExcel(filePath, sheetName = null) {
        try {
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }

            const workbook = XLSX.readFile(filePath);
            const sheet = sheetName || workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheet];

            // Convert to JSON
            const data = XLSX.utils.sheet_to_json(worksheet);

            return data;
        } catch (error) {
            console.error('Error reading Excel file:', error);
            throw error;
        }
    }

    /**
     * Read Excel file dengan kolom spesifik untuk NIPNAS update
     * @param {string} filePath - Path to Excel file
     * @returns {Array<Object>} Array dengan kolom NIK, CA_NAME, KOREKSI NIPNAS
     */
    static readNipnasData(filePath) {
        const data = this.readExcel(filePath);

        // Get column names from environment variables
        const excelColNik = process.env.EXCEL_COLUMN_NIK || 'NIK';
        const excelColCaName = process.env.EXCEL_COLUMN_CA_NAME || 'CA_NAME';
        const excelColKoreksiNipnas = process.env.EXCEL_COLUMN_KOREKSI_NIPNAS || 'KOREKSI NIPNAS';

        // Validate required columns
        const requiredColumns = [excelColNik, excelColCaName, excelColKoreksiNipnas];
        if (data.length > 0) {
            const columns = Object.keys(data[0]);
            const missingColumns = requiredColumns.filter(col => !columns.includes(col));

            if (missingColumns.length > 0) {
                throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
            }
        }

        // Return only required columns
        return data.map(row => ({
            nik: row[excelColNik],
            ca_name: row[excelColCaName],
            koreksi_nipnas: row[excelColKoreksiNipnas]
        }));
    }
}

/**
 * Class untuk update data ke PostgreSQL
 */
class DataUpdater {
    /**
     * Initialize DataUpdater
     * @param {DatabaseConnection} dbConnection - Instance dari DatabaseConnection
     */
    constructor(dbConnection) {
        this.db = dbConnection;
        this.tableName = process.env.DB_TABLE_NAME || 'mytens_datamart.customer_mapping';
        this.dbColNik = process.env.DB_COLUMN_NIK || 'nik';
        this.dbColCaName = process.env.DB_COLUMN_CA_NAME || 'ca_name';
        this.dbColNipnas = process.env.DB_COLUMN_NIPNAS || 'ca_nipnas';
        this.dbColNipnasNcx = process.env.DB_COLUMN_NIPNAS_NCX || 'ca_nipnas_ncx';
    }

    /**
     * Find data berdasarkan NIK dan CA_NAME
     * @param {string} nik - NIK
     * @param {string} ca_name - CA Name
     * @returns {Promise<Object|null>} Data yang ditemukan atau null
     */
    async findData(nik, ca_name) {
        const pool = this.db.getPool();
        const client = await pool.connect();

        try {
            const query = `
        SELECT * FROM ${this.tableName}
        WHERE ${this.dbColNik} = $1 AND ${this.dbColCaName} = $2
      `;
            const result = await client.query(query, [nik, ca_name]);

            if (result.rows.length > 0) {
                return result.rows[0];
            }
            return null;
        } catch (error) {
            console.error('Error finding data:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Update ca_nipnas dan ca_nipnas_ncx
     * @param {string} nik - NIK
     * @param {string} ca_name - CA Name
     * @param {string} koreksi_nipnas - Nilai NIPNAS baru
     * @returns {Promise<Object>} Result update
     */
    async updateNipnas(nik, ca_name, koreksi_nipnas) {
        const pool = this.db.getPool();
        const client = await pool.connect();

        try {
            const query = `
        UPDATE ${this.tableName}
        SET ${this.dbColNipnas} = $1, ${this.dbColNipnasNcx} = $1
        WHERE ${this.dbColNik} = $2 AND ${this.dbColCaName} = $3
        RETURNING *
      `;
            const result = await client.query(query, [koreksi_nipnas, nik, ca_name]);

            return {
                success: true,
                rowsAffected: result.rowCount,
                data: result.rows[0] || null
            };
        } catch (error) {
            console.error('Error updating data:', error);
            return {
                success: false,
                error: error.message
            };
        } finally {
            client.release();
        }
    }

    /**
     * Process single row: find and update
     * @param {Object} rowData - Data from Excel {nik, ca_name, koreksi_nipnas}
     * @returns {Promise<Object>} Result
     */
    async processRow(rowData) {
        const { nik, ca_name, koreksi_nipnas } = rowData;

        try {
            // Step 1: Find data
            const existingData = await this.findData(nik, ca_name);

            if (!existingData) {
                return {
                    success: false,
                    nik,
                    ca_name,
                    message: 'Data not found',
                    existingData: null,
                    updated: false
                };
            }

            // Step 2: Update data
            const updateResult = await this.updateNipnas(nik, ca_name, koreksi_nipnas);

            return {
                success: updateResult.success,
                nik,
                ca_name,
                koreksi_nipnas,
                oldNipnas: existingData[this.dbColNipnas],
                newNipnas: koreksi_nipnas,
                message: updateResult.success ? 'Updated successfully' : updateResult.error,
                updated: updateResult.success,
                rowsAffected: updateResult.rowsAffected
            };
        } catch (error) {
            return {
                success: false,
                nik,
                ca_name,
                message: error.message,
                updated: false
            };
        }
    }

    /**
     * Process batch update from array of data
     * @param {Array<Object>} dataArray - Array of {nik, ca_name, koreksi_nipnas}
     * @param {boolean} dryRun - If true, only simulate without actual update
     * @returns {Promise<Object>} Summary results
     */
    async processBatch(dataArray, dryRun = false) {
        const results = {
            total: dataArray.length,
            success: 0,
            failed: 0,
            notFound: 0,
            details: []
        };

        for (let i = 0; i < dataArray.length; i++) {
            const rowData = dataArray[i];
            console.log(`\nProcessing row ${i + 1}/${dataArray.length}...`);
            console.log(`NIK: ${rowData.nik}, CA_NAME: ${rowData.ca_name} -> KOREKSI NIPNAS: ${rowData.koreksi_nipnas}`);

            if (dryRun) {
                // Dry run: only find, don't update
                const existingData = await this.findData(rowData.nik, rowData.ca_name);
                const result = {
                    success: existingData !== null,
                    nik: rowData.nik,
                    ca_name: rowData.ca_name,
                    koreksi_nipnas: rowData.koreksi_nipnas,
                    oldNipnas: existingData?.[this.dbColNipnas] || null,
                    message: existingData ? 'Found (dry run - not updated)' : 'Not found',
                    updated: false,
                    dryRun: true
                };

                results.details.push(result);
                if (existingData) {
                    results.success++;
                } else {
                    results.notFound++;
                }
            } else {
                // Actual update
                const result = await this.processRow(rowData);
                results.details.push(result);

                if (result.success && result.updated) {
                    results.success++;
                    console.log(`✓ Success: Updated from ${result.oldNipnas} to ${result.newNipnas}`);
                } else if (!result.success && result.message === 'Data not found') {
                    results.notFound++;
                    console.log(`✗ Not found`);
                } else {
                    results.failed++;
                    console.log(`✗ Failed: ${result.message}`);
                }
            }

            // Small delay to avoid overwhelming the database
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        return results;
    }
}

/**
 * Test function untuk testing 1 data
 */
async function testSingleUpdate() {
    console.log('=== TEST SINGLE UPDATE ===\n');

    const db = new DatabaseConnection();

    try {
        await db.testConnection();

        const updater = new DataUpdater(db);

        // Test data - ganti dengan data yang sesuai
        const testData = {
            nik: '1234567890',
            ca_name: 'TEST USER',
            koreksi_nipnas: '999999'
        };

        console.log('Test data:', testData);
        console.log('\nStep 1: Find existing data...');

        const existingData = await updater.findData(testData.nik, testData.ca_name);

        if (!existingData) {
            console.log('❌ Data not found in database');
            console.log('Please update testData with valid NIK and CA_NAME');
            return;
        }

        console.log('✓ Data found:');
        console.log(`  Current ${updater.dbColNipnas}: ${existingData[updater.dbColNipnas]}`);
        console.log(`  Current ${updater.dbColNipnasNcx}: ${existingData[updater.dbColNipnasNcx]}`);

        console.log('\nStep 2: Update data...');
        const result = await updater.processRow(testData);

        if (result.success) {
            console.log('✓ Update successful!');
            console.log(`  Old NIPNAS: ${result.oldNipnas}`);
            console.log(`  New NIPNAS: ${result.newNipnas}`);
            console.log(`  Rows affected: ${result.rowsAffected}`);
        } else {
            console.log('❌ Update failed:', result.message);
        }

        console.log('\nStep 3: Verify update...');
        const verifyData = await updater.findData(testData.nik, testData.ca_name);
        console.log(`  ${updater.dbColNipnas}: ${verifyData[updater.dbColNipnas]}`);
        console.log(`  ${updater.dbColNipnasNcx}: ${verifyData[updater.dbColNipnasNcx]}`);

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        await db.closeAllConnections();
    }
}

/**
 * Main function untuk batch update dari Excel
 */
async function batchUpdateFromExcel(excelFilePath, dryRun = false) {
    console.log('=== BATCH UPDATE FROM EXCEL ===\n');
    console.log(`File: ${excelFilePath}`);
    console.log(`Mode: ${dryRun ? 'DRY RUN (no actual updates)' : 'LIVE UPDATE'}\n`);

    const db = new DatabaseConnection();

    try {
        // Read Excel file
        console.log('Reading Excel file...');
        const data = ExcelReader.readNipnasData(excelFilePath);
        console.log(`✓ Found ${data.length} rows in Excel\n`);

        // Test connection
        await db.testConnection();

        // Process batch
        const updater = new DataUpdater(db);
        const results = await updater.processBatch(data, dryRun);

        // Print summary
        console.log('\n=== SUMMARY ===');
        console.log(`Total rows: ${results.total}`);
        console.log(`Success: ${results.success}`);
        console.log(`Failed: ${results.failed}`);
        console.log(`Not found: ${results.notFound}`);

        // Save results to JSON
        const outputPath = path.join(__dirname, `update_results_${Date.now()}.json`);
        fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
        console.log(`\nDetailed results saved to: ${outputPath}`);

        return results;

    } catch (error) {
        console.error('Batch update failed:', error);
        throw error;
    } finally {
        await db.closeAllConnections();
    }
}

/**
 * Example usage - uncomment salah satu fungsi di bawah untuk testing
 */
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (command === 'test') {
        // Test single update
        await testSingleUpdate();
    } else if (command === 'batch') {
        // Batch update from Excel
        const filePath = args[1];
        const dryRun = args[2] === '--dry-run';

        if (!filePath) {
            console.error('Error: Please provide Excel file path');
            console.log('Usage: node update_data_nipnas.js batch <excel-file-path> [--dry-run]');
            process.exit(1);
        }

        await batchUpdateFromExcel(filePath, dryRun);
    } else {
        // Show help
        console.log('Usage:');
        console.log('  node update_data_nipnas.js test                           - Test single update');
        console.log('  node update_data_nipnas.js batch <file.xlsx>              - Batch update from Excel');
        console.log('  node update_data_nipnas.js batch <file.xlsx> --dry-run    - Dry run (no actual updates)');
        console.log('\nExamples:');
        console.log('  node update_data_nipnas.js test');
        console.log('  node update_data_nipnas.js batch data.xlsx');
        console.log('  node update_data_nipnas.js batch data.xlsx --dry-run');
    }
}

// Export classes and functions
module.exports = {
    DatabaseConnection,
    DataFetcher,
    ExcelReader,
    DataUpdater,
    testSingleUpdate,
    batchUpdateFromExcel,
};

// Run main if executed directly
if (require.main === module) {
    main();
}
