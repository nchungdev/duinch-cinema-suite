import sys
sys.path.insert(0, '/Users/lap16792/Personal/omv-jdownloader-dashboard')
import uvicorn

if __name__ == '__main__':
    uvicorn.run('app.main:app', host='0.0.0.0', port=8086, reload=False, log_level='info')
