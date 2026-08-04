import asyncio
from pathlib import Path
from app.repositories.excel_repository import ExcelStockRepository
from app.repositories.app_database_repository import AppDatabaseRepository
from app.services.count_service import CountService
from app.models.domain import CountTrackingStatus

async def test_full_flow():
    print("--- STARTING FULL BACKEND TEST ---")
    session_repo = AppDatabaseRepository()
    await session_repo.initialize()
    stock_repo = ExcelStockRepository()
    
    excel_files = list(Path("data/uploads").glob("*.xlsx")) + list(Path("uploads").glob("*.xlsx"))
    if not excel_files:
        print("No excel file found!")
        return

    excel_path = excel_files[0]
    print(f"Loading Excel: {excel_path}")
    stock_repo.load_from_excel(excel_path)
    
    count_service = CountService(stock_repo, session_repo)
    await count_service.reload_session_state()
    
    active_session = await session_repo.get_active_session()
    if not active_session:
        print("No active session! Starting session...")
        active_session = await count_service.start_session("Test Session", 1)
    
    session_id = active_session["id"]
    print(f"Active Session ID: {session_id}, Name: {active_session['name']}")
    
    shelves = stock_repo.get_shelves()
    if not shelves:
        print("No shelves in excel!")
        return
        
    test_shelf = "9999" if "9999" in shelves else shelves[0]
    print(f"Testing on shelf: {test_shelf}")
    
    # Set active shelf
    await count_service.set_active_shelf(test_shelf, 1)
    
    # Get shelf detail before
    detail_before = count_service.get_shelf_detail(test_shelf)
    print(f"Shelf before: total_etikets={detail_before['stats'].total_etikets}, pending={detail_before['stats'].pending_etikets}, not_found={detail_before['stats'].not_found_etikets}")
    
    items = detail_before["items"]
    if not items:
        print("No items in shelf!")
        return
        
    first_item = items[0]
    print(f"Testing manual mark_not_found on line_id: {first_item.line_id}, etiket: {first_item.etiket}")
    
    res = await count_service.mark_not_found(test_shelf, [first_item.line_id], 1)
    print(f"mark_not_found result: {res}")
    
    detail_after_manual = count_service.get_shelf_detail(test_shelf)
    item0_after = detail_after_manual["items"][0]
    print(f"Item 0 tracking_status after manual mark: '{item0_after.tracking_status}'")
    print(f"Shelf stats after manual mark: pending={detail_after_manual['stats'].pending_etikets}, not_found={detail_after_manual['stats'].not_found_etikets}")
    
    # Now test CMD:FINISH_SHELF
    print("\n--- Testing CMD:FINISH_SHELF ---")
    scan_res = await count_service.process_scan("CMD:FINISH_SHELF", 1, test_shelf)
    print(f"CMD:FINISH_SHELF message: {scan_res.message}")
    
    detail_after_cmd = count_service.get_shelf_detail(test_shelf)
    print(f"Shelf stats after CMD:FINISH_SHELF: pending={detail_after_cmd['stats'].pending_etikets}, not_found={detail_after_cmd['stats'].not_found_etikets}, completion_pct={detail_after_cmd['stats'].completion_pct}%")
    
    all_not_found = [i for i in detail_after_cmd["items"] if i.tracking_status == CountTrackingStatus.BULUNAMADI.value]
    print(f"Total items with tracking_status == BULUNAMADI: {len(all_not_found)} / {len(detail_after_cmd['items'])}")

    print("\n--- TEST COMPLETE ---")

if __name__ == "__main__":
    asyncio.run(test_full_flow())
