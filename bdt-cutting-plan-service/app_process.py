import pandas as pd
import numpy as np
import os
from etl_cuttingplan import Etl_Cuttingplan
from path_safety import sanitize_identifier, safe_filename

class AppProcess:

    def __init__(self, project_info):

        # Define the file name and folder paths
        self.zip_name = sanitize_identifier(project_info['file_id'])
        self.extracted_folder = os.path.join(os.getcwd(), "data", "extracted")
        self.output_folder = os.path.join(os.getcwd(), "data", "output")

        # Project information
        self.project_info = project_info

        self.final_data = {}

    #############################
    ##### Directory Process #####
    #############################

    def create_directories(self):
        # Create directories if they don't exist
        if not os.path.exists(self.extracted_folder):
            os.makedirs(self.extracted_folder)

        self.upload_folder = os.path.join(self.extracted_folder, self.zip_name)
        if not os.path.exists(self.upload_folder):
            os.makedirs(self.upload_folder)

        if not os.path.exists(self.output_folder):
            os.makedirs(self.output_folder)

    # Remove uploaded files after finished processing
    def remove_files(self):

        # Check if the upload folder exists
        if os.path.exists(self.upload_folder):
            # List the files in the directory
            uploaded_files = os.listdir(self.upload_folder)

            # Iterate over the files and remove each one
            for file in uploaded_files:
                file_path = os.path.join(self.upload_folder, file)
                os.remove(file_path)

            # Remove the subfolder
            os.rmdir(self.upload_folder)

    # Save the uploaded files into the upload folder
    def save_uploaded_files(self, file_storages):
        # Validate every filename in the batch up front so a single unsafe
        # filename rejects the whole batch instead of leaving earlier files
        # in the batch already written to disk (partial state).
        file_storages = list(file_storages)
        destinations = [
            (file_storage, safe_filename(file_storage.filename))
            for file_storage in file_storages
        ]

        for file_storage, filename in destinations:
            destination = os.path.join(self.upload_folder, filename)
            file_storage.save(destination)

    # Process ETL
    def process_etl(self):

        try:

            # Extract and transform data each file
            self.etl = Etl_Cuttingplan(self.project_info['file_id'])
            self.etl.loop_extract_transform()

            # Transform data in specific dataframes
            self.etl.merge_dataframes()
            self.etl.transform_order()

            ######################################################
            # WARNING: NEED TO FIX THIS INCORRECT PROCESS BY USER
            ######################################################
            if self.etl.remnants_table.shape[0] != 0:
                self.etl.transform_remnants()

            self.etl.store_dataframes()

            # Add project information and reorganize columns in each dataframe
            for key, value in self.etl.df_dict.items():
                if not value.empty:
                    self.etl.df_dict[key] = self.etl.add_project_info(self.project_info, value)
                    self.etl.df_dict[key] = self.etl.reorganize_columns(key, value)
                    # self.etl.df_dict[key] = self.etl.change_data_type(value)

            # etl_error = self.etl.msg_error

        except Exception as e:
            raise ValueError(f"Error in ETL process: {str(e)}")

    # Collect parsed tables into a response dict (replaces Sheet-append)
    def build_response_data(self):

        for key, value in self.etl.df_dict.items():

            if not self.etl.df_dict[key].empty:

                self.etl.replace_na_to_none(value)
                post_table = self.etl.convert_native_types()

                self.final_data[key] = post_table

            # Skip remnants if no data
            elif key == 'remnants' and self.etl.df_dict[key].empty:
                pass

            else:
                raise ValueError(f'No data in {key} dataframe')

        return self.final_data

    # Validate request information
    @staticmethod
    def validate_request_info(request_info):

        required_fields = ["file_id", "project_code", "tag", "description", "version", "revision"]

        if not request_info:
            return False

        for field in required_fields:
            if field not in request_info or request_info[field] in (None, ''):
                return False
        return True

if __name__ == '__main__':

    # Project information
    project_info = {
        "file_id" : "153xOrrygyTlTx31S9fkClNzCTBKhpBJD",
        "project_code" : "0X165",
        "project_name" : "WHA T31-4",
        "tag" : "ZONE1",
        "description" : "main-structure",
        "version" : 1,
        "revision" : 0
    }

    app = AppProcess(project_info)

    if app.validate_request_info(project_info):

        # Create directories
        app.create_directories()

        # NOTE: standalone execution requires files to already be present in
        # app.upload_folder (e.g. via app.save_uploaded_files(file_storages)
        # from an HTTP request) since there is no Google Drive download step
        # anymore.

        # Process data
        app.process_etl()

        # Build response data
        app.build_response_data()

        # Clear all files
        app.remove_files()

    else:
        raise ValueError("ERROR: Not all keys found in request")

