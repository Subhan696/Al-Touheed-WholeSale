# Al-Touheed Wholesale - Deployment Guide

## Prerequisites for New System

### 1. Software Requirements
- **Node.js** (v18 or higher) - Download from https://nodejs.org
- **PostgreSQL** (v14 or higher) - Download from https://www.postgresql.org/download/windows/
- **Git** (optional, for cloning) - Download from https://git-scm.com/download/win

### 2. Hardware Requirements
- **Minimum**: 4GB RAM, 20GB free disk space
- **Recommended**: 8GB RAM, 50GB free disk space
- Network connection (for multi-machine setup)

## Installation Steps

### Step 1: Install PostgreSQL
1. Run PostgreSQL installer
2. Set password for `postgres` user (remember this password)
3. Complete installation with default settings
4. Open pgAdmin or use command line to create database

### Step 2: Create Database and User
Open Command Prompt as Administrator and run:
```bash
cd "C:\Program Files\PostgreSQL\16\bin"
psql -U postgres -f "D:\path\to\SHOP\setup_db.sql"
```

This will:
- Create user `atg_user` with password `atg_pass123`
- Create database `atg_wholesale`
- Grant necessary permissions

**⚠️ SECURITY NOTE**: Change the default password in `setup_db.sql` before production deployment.

### Step 3: Install Application Dependencies
```bash
cd D:\path\to\SHOP
npm install
```

### Step 4: Configure Application
1. Start the application: `npm start`
2. Go to **Settings → Network Settings**
3. Configure based on your setup:

#### Single Machine Setup
- **Network Mode**: Server Mode
- **PostgreSQL Database**:
  - Host: `localhost`
  - Port: `5432`
  - Database: `atg_wholesale`
  - Username: `atg_user`
  - Password: `atg_pass123` (or your custom password)
4. Click **Test Connection** to verify
5. Click **Save Settings**
6. Restart application

#### Multi-Machine Setup
**Server Machine (with PostgreSQL):**
- **Network Mode**: Server Mode
- Configure PostgreSQL settings as above
- Note the IP addresses shown in Network Settings
- Ensure Windows Firewall allows port 3002

**Client Machines:**
- **Network Mode**: Client Mode
- **Server Address**: `http://SERVER_IP:3002` (e.g., `http://192.168.1.100:3002`)
- **Network Token**: Set same token on all machines (optional but recommended)
- Click **Test Connection** to verify
- Click **Save Settings**
- Restart application

## Data Migration from Previous System

### Option 1: Using Built-in Backup/Restore

#### On Previous System (Export)
1. Connect USB drive to previous system
2. Open application → Settings → Backup Settings
3. Click **Set Backup Drive** and select USB drive
4. Click **Create Backup Now**
5. Wait for backup completion
6. Safely remove USB drive

#### On New System (Import)
1. Connect USB drive to new system
2. Open application → Settings → Backup Settings
3. Click **Set Backup Drive** and select USB drive
4. Select backup file from list (or use `shop.json` for latest)
5. Click **Restore from Backup**
6. Confirm restore operation
7. Wait for restore completion
8. Restart application

### Option 2: Manual Database Export/Import

#### Export from Previous System
```bash
cd "C:\Program Files\PostgreSQL\16\bin"
pg_dump -U atg_user -h localhost atg_wholesale > backup.sql
```

#### Import to New System
```bash
cd "C:\Program Files\PostgreSQL\16\bin"
psql -U atg_user -h localhost atg_wholesale < backup.sql
```

## Configuration Files to Check

### 1. Environment Variables (Optional)
Create `.env` file in project root:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=atg_wholesale
DB_USER=atg_user
DB_PASSWORD=atg_pass123
API_PORT=3002
NETWORK_TOKEN=your_secret_token_here
```

### 2. Electron Store Configuration
Configuration is stored in:
- **Windows**: `%APPDATA%/al-touheed-wholesale/config.json`
- This file contains network settings, database config, and backup paths

### 3. Receipt Settings
Custom receipt settings are stored in:
- **Windows**: `%APPDATA%/al-touheed-wholesale/receipt_settings.json`
- Copy this file to preserve custom receipt templates

## Data Storage Locations

### Application Data
- **Product Photos**: `%APPDATA%/al-touheed-wholesale/product_photos/`
- **Receipt Settings**: `%APPDATA%/al-touheed-wholesale/receipt_settings.json`
- **Config**: `%APPDATA%/al-touheed-wholesale/config.json`

### Backup Data
- **USB Drive**: `DRIVE_LETTER:/SHOP_Backup/shop.json` (latest backup)
- **Daily Snapshots**: `DRIVE_LETTER:/SHOP_Backup/daily/shop_YYYY-MM-DD.json`

## Building for Production

### Create Installer
```bash
npm run build
npm run package
```

This creates:
- **Installer**: `release/Al-Touheed Wholesale Setup.exe`
- **Location**: Project root `release/` folder

### Install on Target Machine
1. Copy `release/Al-Touheed Wholesale Setup.exe` to target machine
2. Run installer as Administrator
3. Choose installation directory
4. Complete installation
5. Launch application from Desktop or Start Menu

## Post-Deployment Checklist

### Database Verification
- [ ] PostgreSQL service is running
- [ ] Database `atg_wholesale` exists
- [ ] User `atg_user` has correct permissions
- [ ] Test database connection from Network Settings
- [ ] Verify data migration (check product count, sales count)

### Application Verification
- [ ] Application launches without errors
- [ ] Login with existing user credentials
- [ ] All modules load correctly (Sales, Purchases, Stock, Reports)
- [ ] Print functionality works (receipt printer, barcode printer)
- [ ] Backup/restore functionality works

### Network Verification (if multi-machine)
- [ ] Server machine is accessible from clients
- [ ] Port 3002 is open in Windows Firewall
- [ ] Client machines can connect to server
- [ ] Real-time data sync works (test by adding sale on one machine, check on another)

### Data Verification
- [ ] All products migrated correctly
- [ ] All customer data migrated
- [ ] All supplier data migrated
- [ ] Sales history preserved
- [ ] Purchase history preserved
- [ ] Stock levels accurate
- [ ] Financial data (GL accounts, vouchers) intact

### Security Verification
- [ ] Change default database password
- [ ] Set network token for multi-machine setup
- [ ] Configure appropriate user permissions
- [ ] Enable regular backups

## Troubleshooting

### Database Connection Issues
**Problem**: "Connection refused" or "authentication failed"
**Solutions**:
1. Verify PostgreSQL service is running
2. Check credentials in Network Settings
3. Ensure database exists: `psql -U postgres -l`
4. Test connection: `psql -U atg_user -h localhost -d atg_wholesale`

### Port 3002 Blocked
**Problem**: Client cannot connect to server
**Solutions**:
1. Add Windows Firewall rule:
   ```cmd
   netsh advfirewall firewall add rule name="Al-Touheed API" dir=in action=allow protocol=TCP localport=3002
   ```
2. Disable antivirus temporarily to test
3. Check server IP address is correct

### Data Migration Issues
**Problem**: Restore fails or data missing
**Solutions**:
1. Verify backup file is not corrupted
2. Check database schema matches (run application first to initialize schema)
3. Use manual pg_dump/pg_restore if built-in fails
4. Check logs in application console

### Print Issues
**Problem**: Receipts/barcodes not printing
**Solutions**:
1. Verify printer is installed and set as default
2. Check printer settings in application
3. Test with Windows print dialog first
4. Ensure printer drivers are up to date

## Regular Maintenance

### Daily
- [ ] Verify automatic backup ran (check USB drive)
- [ ] Check application logs for errors

### Weekly
- [ ] Test database integrity
- [ ] Verify backup files are valid
- [ ] Check disk space

### Monthly
- [ ] Archive old daily snapshots
- [ ] Review user permissions
- [ ] Update application if new version available

## Support

For issues or questions:
1. Check this guide first
2. Review application logs (Console in developer tools)
3. Check PostgreSQL logs: `C:\Program Files\PostgreSQL\16\data\log\`
4. Contact system administrator

## Security Best Practices

1. **Change Default Passwords**: Always change default database and user passwords
2. **Network Token**: Use strong network tokens for multi-machine setup
3. **Regular Backups**: Keep backups on separate drives
4. **User Permissions**: Limit user access based on role
5. **Firewall**: Only open necessary ports
6. **Updates**: Keep PostgreSQL and Node.js updated
7. **Antivirus**: Keep antivirus software updated

## Version Information

- **Application Version**: 1.0.0
- **PostgreSQL Version**: 14+
- **Node.js Version**: 18+
- **Electron Version**: 22.3.27

## Notes

- This application uses PostgreSQL for data storage
- Configuration is stored in electron-store (persistent across updates)
- Backups are JSON-based and include all database tables
- Multi-machine mode uses Express API with Server-Sent Events for real-time sync
- Application is single-instance (only one instance can run at a time)
