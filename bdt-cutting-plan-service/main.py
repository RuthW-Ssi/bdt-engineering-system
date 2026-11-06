import os
import functions_framework
from flask import Flask
from app_process import AppProcess

app = Flask(__name__)

REQUIRED_FIELDS = [
    "file_id", "project_code", "tag", "description", "version", "revision",
]

# Local debug:
# python -m functions_framework --target=process_cuttingplan --debug --port=8080
# curl -F file_id=abc123 -F project_code=PC1 -F tag=T1 \
#      -F description=d -F version=1 -F revision=0 \
#      -F files=@report1.txt -F files=@report2.txt \
#      http://localhost:8080/


@functions_framework.http
def process_cuttingplan(request):

    form_data = {field: request.form.get(field) for field in REQUIRED_FIELDS}
    # project_name is not part of the public API — always "". etl_cuttingplan.py's
    # reorganize_columns() hardcodes "the last 7 columns are project metadata"
    # (untouched logic, not ours to change), so the count must stay exactly 7.
    form_data["project_name"] = ""

    if not AppProcess.validate_request_info(form_data):
        return {
            "code": 400,
            "status": "failed",
            "description": "ERROR: Not all keys found in request",
        }, 400

    uploaded_files = request.files.getlist('files')
    if not uploaded_files:
        return {
            "code": 400,
            "status": "failed",
            "description": "ERROR: No files uploaded",
        }, 400

    app_process = None

    try:
        app_process = AppProcess(form_data)
        app_process.create_directories()
        app_process.save_uploaded_files(uploaded_files)
        app_process.process_etl()
        data = app_process.build_response_data()
        app_process.remove_files()

        return {
            "code": 200,
            "file_id": form_data['file_id'],
            "status": "success",
            "description": "ETL successfully completed",
            "data": data,
        }

    except Exception as e:

        # Only clean up if create_directories() actually ran far enough to
        # set self.upload_folder — AppProcess(...) or an early failure in
        # create_directories() can raise before that attribute exists, and
        # remove_files() unconditionally reads it (see Task 6). Calling it
        # in that state would raise a masking AttributeError here and crash
        # the handler instead of returning the JSON error body below.
        if app_process is not None and hasattr(app_process, "upload_folder"):
            app_process.remove_files()

        return {
            "code": 500,
            "file_id": form_data.get('file_id'),
            "status": "failed",
            "description": str(e),
        }, 500


if __name__ == "__main__":
    app.run(port=int(os.environ.get("PORT", 8080)), host='0.0.0.0', debug=True)
