import re
with open(r'd:\projects\SHOP\electron\main.js', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = '''    ipcMain.handle('print-receipt', async (event, receiptData) => {
      return new Promise((resolve) => {
        try {
          let htmlContent = '';
          let printerName = null;
          
          if (typeof receiptData === 'string') {
            htmlContent = receiptData;
          } else if (receiptData && receiptData.html) {
            htmlContent = receiptData.html;
            printerName = receiptData.printer;
          }

          if (!htmlContent) {
            return resolve({ success: false, error: 'No HTML content provided' });
          }

          const printWin = new BrowserWindow({ 
            show: false,
            webPreferences: { nodeIntegration: true, contextIsolation: false } 
          });

          printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

          printWin.webContents.on('did-finish-load', () => {
            const printOptions = {
              silent: false,
              printBackground: true
            };
            
            if (printerName) {
              printOptions.deviceName = printerName;
              printOptions.silent = true; 
            }

            printWin.webContents.print(printOptions, (success, errorType) => {
              printWin.close();
              if (success) {
                resolve({ success: true });
              } else {
                resolve({ success: false, error: errorType || 'Print failed' });
              }
            });
          });
        } catch (err) {
          resolve({ success: false, error: err.message });
        }
      });
    });'''

# find the block and replace
pattern = re.compile(r"ipcMain\.handle\('print-receipt', async \(event, receiptData\) => \{\s*return \{ success: true \};.*?\n\s*\}\);", re.MULTILINE)

new_content = pattern.sub(replacement, content)
with open(r'd:\projects\SHOP\electron\main.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

if new_content != content:
    print('Replaced successfully')
else:
    print('Failed to replace')
