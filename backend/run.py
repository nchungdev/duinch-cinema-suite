import os
import sys

# Get the absolute path of the current file's directory
current_dir = os.path.dirname(os.path.abspath(__file__))
# Get the parent directory of backend (the project root)
project_root = os.path.dirname(current_dir)
sys.path.insert(0, project_root)
sys.path.insert(0, current_dir)

import uvicorn

if __name__ == '__main__':
    uvicorn.run('app.main:app', host='0.0.0.0', port=8086, reload=False, log_level='info')
