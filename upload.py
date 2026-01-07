import os
import subprocess
import datetime

# --- Configuration ---
# Global variables for files to ignore and git settings
IGNORE_PATTERNS = [
    '__pycache__',
    '*.pyc',
    'venv/',
    '.DS_Store',
    '.env',
    'dist/',
    'build/',
    'test_rispy.py',
    'upload.py',
    'start_server.py'
]
BRANCH_NAME = 'main'
REMOTE_NAME = 'origin'
REPO_URL = "https://github.com/kemu-chem/kemu_handbook.git"       # Set this to "https://github.com/username/repo.git" to auto-configure
GIT_USER_NAME = "kemu-chem"  # Set this to "Your Name" to auto-configure
GIT_USER_EMAIL = "keitamurakami.mk@gmail.com" # Set this to "you@example.com" to auto-configure
# ---------------------

def run_command(command):
    """Executes a shell command and raises an error if it fails."""
    try:
        subprocess.run(command, check=True, shell=True)
    except subprocess.CalledProcessError as e:
        print(f"Error running command: {command}")
        print(e)
        exit(1)

def update_gitignore():
    """Ensures IGNORE_PATTERNS are present in .gitignore."""
    gitignore_path = '.gitignore'
    existing_patterns = set()
    
    if os.path.exists(gitignore_path):
        with open(gitignore_path, 'r', encoding='utf-8') as f:
            existing_patterns = set(line.strip() for line in f if line.strip())
            
    with open(gitignore_path, 'a', encoding='utf-8') as f:
        # If file was empty or didn't exist, ensure we start on a new line if needed? 
        # But 'a' mode on new file starts at 0. On existing, it appends.
        # It's safer to prepend a newline if the file exists and doesn't end with one,
        # but let's just append.
        for pattern in IGNORE_PATTERNS:
            if pattern not in existing_patterns:
                f.write(f"{pattern}\n")
                print(f"Added {pattern} to .gitignore")

def main():
    print("--- GitHub Upload Script ---")
    
    # 1. Update .gitignore
    print("Checking .gitignore...")
    update_gitignore()

    # 1.5 Configure Git Identity if needed
    current_name = subprocess.run("git config user.name", shell=True, capture_output=True, text=True).stdout.strip()
    current_email = subprocess.run("git config user.email", shell=True, capture_output=True, text=True).stdout.strip()

    if not current_name:
        if GIT_USER_NAME:
            print(f"Setting local git user.name to '{GIT_USER_NAME}'...")
            run_command(f'git config user.name "{GIT_USER_NAME}"')
        else:
            print("Git user.name is not configured.")
            name_input = input("Enter your name: ").strip()
            if name_input:
                run_command(f'git config user.name "{name_input}"')
    
    if not current_email:
        if GIT_USER_EMAIL:
            print(f"Setting local git user.email to '{GIT_USER_EMAIL}'...")
            run_command(f'git config user.email "{GIT_USER_EMAIL}"')
        else:
            print("Git user.email is not configured.")
            email_input = input("Enter your email: ").strip()
            if email_input:
                run_command(f'git config user.email "{email_input}"')

    # 2. Add changes
    print("Adding files...")
    run_command("git add .")

    # 3. Check status
    status_result = subprocess.run("git status --porcelain", shell=True, capture_output=True, text=True)
    if not status_result.stdout.strip():
        print("No changes to commit.")
        # Even if no changes, we might want to push if there are unpushed commits?
        # But usually 'upload' implies 'save current state'.
        # Let's check if we are ahead of remote later.
    else:
        # 4. Commit
        commit_msg = input("Enter commit message (leave empty to use timestamp): ").strip()
        if not commit_msg:
            # Use ISO format-like timestamp
            commit_msg = f"Auto-commit: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        
        print(f"Committing with message: '{commit_msg}'")
        run_command(f'git commit -m "{commit_msg}"')

    # 5. Push
    # Check if remote exists, configure if needed
    try:
        subprocess.run(f"git remote get-url {REMOTE_NAME}", check=True, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        print(f"Remote '{REMOTE_NAME}' is not configured.")
        target_url = REPO_URL
        if not target_url:
            target_url = input(f"Enter the URL for remote '{REMOTE_NAME}': ").strip()
        
        if target_url:
            print(f"Adding remote '{REMOTE_NAME}' with URL: {target_url}")
            run_command(f"git remote add {REMOTE_NAME} {target_url}")
        else:
            print("No remote URL provided. Skipping push.")
            return

    print(f"Pushing to {REMOTE_NAME}/{BRANCH_NAME}...")
    try:
        run_command(f"git push {REMOTE_NAME} {BRANCH_NAME}")
        print("Upload complete!")
    except SystemExit: # run_command exits on error
        pass # The error message is already printed by run_command
    except Exception as e:
        print(f"Push failed: {e}")
        print("You might need to set upstream branch or check credentials.")

if __name__ == "__main__":
    main()
