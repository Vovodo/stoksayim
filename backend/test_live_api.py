import requests

BASE_URL = "http://127.0.0.1:8000"

def test_live():
    print("--- TESTING LIVE API ---")
    session = requests.Session()
    
    # 1. Login
    login_res = session.post(f"{BASE_URL}/api/auth/token", data={"username": "apae1111", "password": "twjsQ0_vay"})
    if login_res.status_code != 200:
        print(f"Login failed! Status: {login_res.status_code}, Response: {login_res.text}")
        return
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("Login successful! Token acquired.")
    
    # 2. Get active shelf detail
    meta_res = session.get(f"{BASE_URL}/api/meta", headers=headers)
    meta = meta_res.json()
    active_shelf = meta.get("active_shelf") or "9999"
    print(f"Active shelf from meta: {active_shelf}")
    
    shelf_res = session.get(f"{BASE_URL}/api/shelves/{active_shelf}", headers=headers)
    if shelf_res.status_code != 200:
        print(f"Failed to get shelf {active_shelf}! Status: {shelf_res.status_code}")
        return
    detail = shelf_res.json()
    items = detail["items"]
    print(f"Shelf {active_shelf} items count: {len(items)}, stats: {detail['stats']}")
    
    if not items:
        print("No items on shelf!")
        return
        
    target_item = items[0]
    line_id = target_item["line_id"]
    etiket = target_item["etiket"]
    print(f"Targeting first item line_id={line_id}, etiket={etiket}, current tracking_status={target_item.get('tracking_status')}")
    
    # 3. Test markNotFound
    print("\n--> Sending POST /api/not-found/mark ...")
    mark_res = session.post(f"{BASE_URL}/api/not-found/mark", json={"shelf": active_shelf, "line_ids": [line_id]}, headers=headers)
    print(f"markNotFound status: {mark_res.status_code}, body: {mark_res.text}")
    
    # Verify shelf detail after mark
    shelf_after = session.get(f"{BASE_URL}/api/shelves/{active_shelf}", headers=headers).json()
    item_after = shelf_after["items"][0]
    print(f"Item 0 tracking_status after mark: '{item_after.get('tracking_status')}'")
    print(f"Shelf stats after mark: pending={shelf_after['stats']['pending_etikets']}, not_found={shelf_after['stats'].get('not_found_etikets')}")
    
    # 4. Test CMD:FINISH_SHELF
    print("\n--> Sending POST /api/scan with 'CMD:FINISH_SHELF' ...")
    cmd_res = session.post(f"{BASE_URL}/api/scan", json={"etiket": "CMD:FINISH_SHELF", "shelf_override": active_shelf}, headers=headers)
    print(f"CMD:FINISH_SHELF status: {cmd_res.status_code}, message: {cmd_res.json().get('message')}")
    
    shelf_after_cmd = session.get(f"{BASE_URL}/api/shelves/{active_shelf}", headers=headers).json()
    print(f"Shelf stats after CMD:FINISH_SHELF: pending={shelf_after_cmd['stats']['pending_etikets']}, not_found={shelf_after_cmd['stats'].get('not_found_etikets')}, completion_pct={shelf_after_cmd['stats']['completion_pct']}%")
    
    not_found_items = [i for i in shelf_after_cmd["items"] if i.get("tracking_status") == "BULUNAMADI"]
    print(f"Total BULUNAMADI items on shelf: {len(not_found_items)} / {len(shelf_after_cmd['items'])}")
    print("\n--- LIVE API TEST COMPLETED SUCCESSFULLY ---")

if __name__ == "__main__":
    test_live()
