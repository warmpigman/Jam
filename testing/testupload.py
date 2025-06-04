import requests
import sys
import os
import mimetypes

def detect_file_type(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    image_exts = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'}
    text_exts = {'.txt'}
    if ext in image_exts:
        return "image"
    elif ext in text_exts:
        return "text"
    else:
        raise ValueError(f"Unsupported file extension: {ext}")

def get_mime_type(file_path):
    mime_type, _ = mimetypes.guess_type(file_path)
    return mime_type or 'application/octet-stream'

def send_file_to_server(file_path, server_url="http://localhost:8080/embed"):
    mime_type = get_mime_type(file_path)
    with open(file_path, "rb") as f:
        files = {
            'file': (os.path.basename(file_path), f, mime_type)
        }
        response = requests.post(server_url, files=files)

    print("Status code:", response.status_code)
    try:
        print("Response:", response.json())
    except Exception:
        print("Response text:", response.text)

def send_search_to_server(file_path, server_url="http://localhost:8080/search", limit=5):
    mime_type = get_mime_type(file_path)
    with open(file_path, "rb") as f:
        files = {
            'file': (os.path.basename(file_path), f, mime_type)
        }
        data = {'limit': str(limit)}
        response = requests.post(server_url, files=files, data=data)

    print("Status code:", response.status_code)
    try:
        print("Response:", response.json())
    except Exception:
        print("Response text:", response.text)

def delete_from_server(vector_id, server_url="http://localhost:8080/delete"):
    response = requests.delete(f"{server_url}/{vector_id}")
    
    print("Status code:", response.status_code)
    try:
        print("Response:", response.json())
    except Exception:
        print("Response text:", response.text)
def interactive_delete(server_url="http://localhost:8080"):
    """Interactive deletion with list display"""
    try:
        while True:
            # Get and display current entries
            response = requests.get(f"{server_url}/list")
            
            if response.status_code != 200:
                print("Error fetching entries from server")
                break
                
            entries = response.json()
            
            if not entries:
                print("No entries found in the database.")
                break
                
            print("\n" + "="*60)
            print("CURRENT ENTRIES:")
            print("="*60)
            
            for i, entry in enumerate(entries, 1):
                filename = entry.get('filename', 'N/A')
                vector_id = entry.get('vector_id', 'N/A')
                entry_type = entry.get('type', 'N/A')
                content_type = entry.get('content_type', 'N/A')
                
                print(f"{i:2d}. {filename}")
                print(f"    Vector ID: {vector_id}")
                print(f"    Type: {entry_type} | Content: {content_type}")
                print("-" * 40)
            
            print(f"\nEnter index number (1-{len(entries)}) to delete, or 'q' to quit:")
            user_input = input("> ").strip()
            
            if user_input.lower() == 'q':
                print("Exiting...")
                break
                
            if not user_input:
                continue
                
            try:
                index = int(user_input)
                if index < 1 or index > len(entries):
                    print(f"Invalid index. Please enter a number between 1 and {len(entries)}")
                    continue
                    
                # Get the vector_id from the selected entry
                selected_entry = entries[index - 1]
                vector_id = selected_entry.get('vector_id')
                filename = selected_entry.get('filename', 'N/A')
                
                print(f"\nDeleting entry {index}: {filename}")
                print(f"Vector ID: {vector_id}")
                
                # Attempt to delete
                delete_response = requests.delete(f"{server_url}/delete/{vector_id}")
                
                print("Status code:", delete_response.status_code)
                try:
                    result = delete_response.json()
                    if delete_response.status_code == 200:
                        print(f"✓ {result.get('message', 'Successfully deleted')}")
                    else:
                        print(f"✗ {result.get('error', 'Delete failed')}")
                except Exception:
                    print("Response text:", delete_response.text)
                    
            except ValueError:
                print("Invalid input. Please enter a number or 'q' to quit.")
                continue
                
            print("\nPress Enter to continue...")
            input()
            
    except KeyboardInterrupt:
        print("\n\nExiting...")
    except Exception as e:
        print(f"Error: {e}")
        
def list_all_entries(server_url="http://localhost:8080/list"):
    response = requests.get(server_url)
    
    print("Status code:", response.status_code)
    try:
        entries = response.json()
        print(f"Found {len(entries)} entries:")
        for i, entry in enumerate(entries, 1):
            print(f"{i}. Vector ID: {entry.get('vector_id')}")
            print(f"   Type: {entry.get('type')}")
            print(f"   Filename: {entry.get('filename')}")
            print(f"   Content Type: {entry.get('content_type')}")
            print(f"   Preview: {entry.get('preview')}")
            print(f"   Mongo Ref: {entry.get('mongo_ref')}")
            print("-" * 50)
    except Exception:
        print("Response text:", response.text)


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in {"upload", "search", "delete", "list"}:
        print("Usage:")
        print("  python testupload.py upload <file_path>")
        print("  python testupload.py search <file_path> [limit]")
        print("  python testupload.py delete [vector_id]")
        print("  python testupload.py list")
        sys.exit(1)

    command = sys.argv[1]
    
    if command == "upload":
        if len(sys.argv) < 3:
            print("Error: file_path required for upload")
            sys.exit(1)
        file_path = sys.argv[2]
        send_file_to_server(file_path)
    elif command == "search":
        if len(sys.argv) < 3:
            print("Error: file_path required for search")
            sys.exit(1)
        file_path = sys.argv[2]
        limit = int(sys.argv[3]) if len(sys.argv) > 3 else 5
        send_search_to_server(file_path, limit=limit)
    elif command == "delete":
        if len(sys.argv) < 3:
            # No vector_id provided, start interactive mode
            interactive_delete()
        else:
            vector_id = sys.argv[2]
            delete_from_server(vector_id)
    elif command == "list":
        list_all_entries()