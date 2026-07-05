import os
import sys
import base64
from fastapi.testclient import TestClient

# Ensure the backend directory is in the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app

# We will create the TestClient inside a context manager so the app's lifespan events run


def main():
    # Use the existing test image from backend/assets/
    test_image_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "00000001_000.png")
    
    if not os.path.exists(test_image_path):
        print(f"❌ Test image not found at {test_image_path}")
        return

    print("🚀 Sending image to /predict API...")
    
    with open(test_image_path, "rb") as f:
        with TestClient(app) as client:
            response = client.post(
                "/predict",
                files={"file": ("test_image.png", f, "image/png")}
            )
    
    if response.status_code != 200:
        print(f"❌ Error {response.status_code}: {response.text}")
        return

    data = response.json()
    print("✅ Request successful!\n")
    
    print("--- ML PREDICTIONS ---")
    print(f"Disease     : {data.get('disease')}")
    print(f"Confidence  : {data.get('probability'):.1%}")
    print(f"Positive    : {data.get('positive')}\n")
    
    # Save the heatmap image
    heatmap_base64 = data.get("heatmap_base64")
    if heatmap_base64:
        heatmap_bytes = base64.b64decode(heatmap_base64)
        heatmap_path = os.path.join(os.path.dirname(__file__), "heatmap_output.png")
        with open(heatmap_path, "wb") as f:
            f.write(heatmap_bytes)
        print(f"📸 Saved heatmap to: {heatmap_path}")
    
    # Save the raw report text as markdown
    report = data.get("report", {})
    report_text = report.get("raw_text")
    if report_text:
        report_path = os.path.join(os.path.dirname(__file__), "report_output.md")
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(report_text)
        print(f"📄 Saved drafted report to: {report_path}")
        print("\n--- REPORT PREVIEW ---")
        # Print a snippet of the report for quick feedback
        print(report_text[:300] + "...\n(See full file for more)")

if __name__ == "__main__":
    main()
