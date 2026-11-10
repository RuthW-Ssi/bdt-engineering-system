import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import pandas as pd
import re
import zipfile
import numpy as np

class ReportFileErrors(ValueError):
    """Every report that failed, as [{'File name', 'Error message'}]; str() is the same text as before."""

    def __init__(self, errors):
        super().__init__(f"{errors}")
        self.errors = errors


class Etl_Cuttingplan:

    def __init__(self, zip_name):

        self.msg_error = ""

        # Define the file name and folder paths
        self.zip_name = zip_name
        self.input_folder = os.path.join(os.getcwd(), "data", "input_zip")
        self.extracted_folder = os.path.join(os.getcwd(), "data", "extracted")
        self.output_folder = os.path.join(os.getcwd(), "data", "output")

        # Define the column headers
        self.nesting_head = [
            'nc_file',
            'need_date',
            'nesting_length_mm',
            'nesting_width_mm',
            'changer',
            'gen_date',
            'gen_time',
            'technology'
        ]
        self.used_mat_head = [
            "article_number",
            "count",
            "plate_number",
            "charge",
            "quality",
            "thick_mm",
            "width_mm",
            "length_mm", 
            "area_m2",
            "weight_kg",
            "nesting_percent"
        ]
        self.order_head = [
            "tag_part",
            "order_number",
            "item",
            "nested",
            "ordered",
            "due_date",
            "drawing_part_no_version_no",
            "length_mm",
            "X",
            "width_mm",
            "weight_kg"
        ]
        self.plate_usage_head = [
            "order_number",
            "net_kg",
            "gross_kg"
        ]
        self.remnant_head = [
            "plate_number",
            "dimensions",
            "area_m2",
            "weight_kg",
            "count",
            "ref_plate",
            "ref_plate_seq"
        ]
        self.machinetime_head = [
            "path_type",
            "time_min",
            "quantity",
            "start_time_min",
            "total_time_min"
        ]

        # Initialize the DataFrames
        self.nesting_table = pd.DataFrame(columns=self.nesting_head)
        self.used_mat_table = pd.DataFrame(columns=self.used_mat_head)
        self.order_table = pd.DataFrame(columns=self.order_head)
        self.plate_usage_table = pd.DataFrame(columns=self.plate_usage_head)
        self.remnants_table = pd.DataFrame(columns=self.remnant_head)
        self.machinetime_table = pd.DataFrame(columns=self.machinetime_head)

        # Prepare dataframes in dict before converting data
        self.df_dict = {}
        # Initialize the post data list
        self.post_data = []

    ######################################################
    ##### Individually Extract and Transform Process #####
    ######################################################

    def detect_section(self, content):
        required_sections = ["NESTING", "Used Material	Usage", "Orders", "Plate usage per order in kg", "Machine times"]
        
        det_section = False

        for section in required_sections:
            if section not in content:
                return False
                # raise ValueError(f"Section '{section}' not found in the file.")
            else:
                return True

    
    def get_p_section(self, text, keyword, start_line, end_line, seperator= 'whole_line'):    
        if seperator== 'whole_line':
            for line in range(start_line,len(text)):
                if keyword in text[line]:
                    end_line = line
                    section = text[start_line:end_line]
                    start_line = line
                    break
        elif seperator== 'startword':
            for line in range(start_line,len(text)):
                if text[line].startswith(keyword):
                    end_sec = line
                    section = text[start_line:end_sec+1]
                    start_line = line
        elif seperator== 'endword':
            for line in range(start_line,len(text)):
                if text[line].endswith(keyword):
                    end_sec = line
                    section = text[start_line:end_sec+1]
                    start_line = line

        return start_line, end_line, section

    def get_sections(self, text):

        # Split the text into lines
        # text = text.split('\n')

        start_line = 0
        end_line = 0

        sections = {
            'nesting': [],
            'used_material': [],
            'orders': [],
            'plate_usage': [],
            'remnants': [],
            'machine_times': []
        }

        start_line, end_line, section = self.get_p_section(text, 'NESTING', start_line, end_line, seperator='whole_line')
        start_line, end_line, sections['nesting'] = self.get_p_section(text, 'Used Material', start_line, end_line, seperator='startword')
        start_line, end_line, sections['used_material'] = self.get_p_section(text, 'Orders', start_line, end_line, seperator='whole_line')
        start_line, end_line, sections['orders'] = self.get_p_section(text, 'Plate usage per order in kg', start_line, end_line, seperator='whole_line')

        found_rem = False
        for line in range(start_line,len(text)):
            if 'Remnants' in text[line]:
                found_rem = True
                break

        if found_rem:
            start_line, end_line, sections['plate_usage'] = self.get_p_section(text, 'Remnants', start_line, end_line)
            start_line, end_line, sections['remnants'] = self.get_p_section(text, 'Machine times', start_line, end_line)
        else:
            start_line, end_line, sections['plate_usage'] = self.get_p_section(text, 'Machine times', start_line, end_line)

        for line in range(start_line,len(text)):
            if text[line].startswith('Total'):
                end_sec = line
                sections['machine_times'] = text[start_line:end_sec+1]

        return sections

    # Extract Used Material (2nd section)
    def extract_used_mat(self, section=list, header=list, key=int):
        
        try:

            # Extract to list each line
            table = section[1:]  # Skip the title

            # Get data where specific position is integer
            alist = []
            for line in table:
                words = line.split('\t')
                try:
                    int(words[key])
                    alist.append(words)
                except:
                    pass

            self.used_mat_df = pd.DataFrame(data=alist, columns=header)

            # Check if DataFrame has more than one row
            if int(self.used_mat_df.shape[0]) > 1:
                raise ValueError("The system cannot handle multiple used material. Please check the file and try to single material again.")
            else:
                pass

            # Check if "charge" is present in the DataFrame
            self.ref_cuttingplan = str(self.used_mat_df['charge'][0])
            # Remove leading and trailing whitespaces
            self.used_mat_df['plate_number'] = self.used_mat_df['plate_number'].str.strip()
            self.ref_plate = self.used_mat_df['plate_number'][0]

            if self.used_mat_df.shape[0] == 0:
                raise ValueError("Empty used material data.")

            # Add cuttingplan number to the DataFrame
            self.used_mat_df[["cuttingplan_number"]] = self.ref_cuttingplan
            self.used_mat_df["source_file"] = self.ref_file
            self.used_mat_table = pd.concat([self.used_mat_table, self.used_mat_df], ignore_index=True)

        except Exception as e:
            raise ValueError(f"Text format in Used Material is not complatible with criteria >>> {e}")

    # Extract nesting information (1st section)
    def extract_nesting_info(self, section=list):

        try:

            table = section[1:]

            key_value = {}
            # Regex pattern to match the date and time format
            pattern_date = r'\d{2}\.\d{2}\.\d{4}'
            pattern_time = r'\d{2}:\d{2}'

            for i in range(len(table)):
                words = table[i].split('\t')
                for j in range(len(words)):
                    if words[j] == ':' and words[j-1] == "Nesting Dim.":
                        key_value["nesting_length_mm"] = words[j+1]
                        key_value["nesting_width_mm"] = words[j+3]
                    elif words[j] == ':':
                        key_value[words[j-1]] = words[j+1]
                    # Check if the date string matches the pattern
                    elif re.match(pattern_date, words[j]) and words[j-2] != "Need Date":
                        key_value["gen_date"] = words[j]
                    elif re.match(pattern_time, words[j]):
                        key_value["gen_time"] = words[j]

            change_key_name = {
                'NC File' : 'nc_file',
                'Need Date' : 'need_date',
                'Nesting Dim.' : 'nesting_dim',
                'Changer' : 'changer',
                'Technology': 'technology'
            }

            key_value = {change_key_name.get(k, k): v for k, v in key_value.items()}
            
            self.nesting_df = pd.DataFrame([key_value])

            if len(self.nesting_df) == 0:
                raise ValueError("Empty used NESTING data.")
            else:
                self.nesting_df[["cuttingplan_number"]] = self.ref_cuttingplan
                self.nesting_df["source_file"] = self.ref_file
                self.nesting_table = pd.concat([self.nesting_table, self.nesting_df], ignore_index=True)

        except Exception as e:
            raise ValueError(f"Text format in NESTING information is not complatible with criteria. >>> {e}")

    # Extract Order Part (3rd section)
    def extract_order(self, section=list, header=list, key=int):
        
        try:

            # Extract to list each line
            table = section[1:]  # Skip the title

            # Get data where specific position is integer
            alist = []
            for line in table:
                words = line.split('\t')
                try:
                    int(words[key])
                    alist.append(words)
                except:
                    pass

            self.order_df = pd.DataFrame(data=alist, columns=header)

            if self.order_df.shape[0] == 0:
                raise ValueError("Empty part order data.")
            else:
                self.order_df[["cuttingplan_number"]] = self.ref_cuttingplan
                self.order_df["source_file"] = self.ref_file
                self.order_table = pd.concat([self.order_table, self.order_df], ignore_index=True)
    
        except Exception as e:
            raise ValueError(f"Text format in Orders (part) is not complatible with criteria. >>> {e}")

    # Extract Plate Usage (4th section)
    def sortout_plateusage(self, section=list, header=list):

        try:

            # Sort out: title and total
            table = section[2:-1]

            # Get data where first value is integer
            alist = []
            for line in table:
                words = line.split('\t')
                try:
                    float(words[1])
                    alist.append(words)
                except:
                    pass

            self.plateusage_df = pd.DataFrame(data=alist, columns=header)

            if len(self.plateusage_df) == 0:
                raise ValueError("Empty plate usage data.")
            else:
                self.plateusage_df[["cuttingplan_number"]] = self.ref_cuttingplan
                self.plateusage_df["source_file"] = self.ref_file
                self.plateusage_df = self.plateusage_df[self.plateusage_df['order_number'] != 'Total']
                self.plate_usage_table = pd.concat([self.plateusage_df, self.plate_usage_table], ignore_index=True)

        except Exception as e:
            raise ValueError(f"Text format in Plate Usage Per Kg is not complatible with criteria. >>> {e}")

    # Extract Remnants (5th section)
    def sortout_remnants(self, section=list, header=list, key=int):

        try:

            # Extract to list each line
            table = section[1:]  # Skip the title

            # Get data where first value is integer
            alist = []
            ref_n = 0

            # Use try-except logic to sort out the unnecessary data

            for line in table:
                try:
                    words = line.split('\t')
                    int(words[key])
                    ref_n += 1
                    words.append(self.ref_plate)
                    words.append(f"{self.ref_plate}-{ref_n}")
                    alist.append(words)
                except:
                    pass

            self.remnant_df = pd.DataFrame(data=alist, columns=header)

            ######################################################
            # WARNING: NEED TO FIX THIS INCORRECT PROCESS BY USER
            ######################################################

            if len(self.remnant_df) == 0:
                raise ValueError(f"Empty remnants data.")
            else:
                self.remnant_df[["cuttingplan_number"]] = self.ref_cuttingplan
                self.remnant_df["source_file"] = self.ref_file
                self.remnants_table = pd.concat([self.remnant_df, self.remnants_table], ignore_index=True)
            
            self.remnant_df[["cuttingplan_number"]] = self.ref_cuttingplan
            self.remnant_df["source_file"] = self.ref_file
            self.remnants_table = pd.concat([self.remnant_df, self.remnants_table], ignore_index=True)

        except Exception as e:
            raise ValueError(f"Text format in Remnants is not complatible with criteria. >>> {e}")

    # Extract Machine Time (5th or 6th section)
    def sortout_machinetime(self, section=list, header=list):
        
        try:
            table = section[3:]
            alist = []

            for line in table:
                if line.startswith('Total'):
                    words = line.split('\t')
                    alist.append(words)
                    break

            self.machinetime_df = pd.DataFrame(data=alist, columns=header)

            if len(self.machinetime_df) == 0:
                raise ValueError("Empty used machine times data.")
            else:
                self.machinetime_df[["cuttingplan_number"]] = self.ref_cuttingplan
                self.machinetime_df["source_file"] = self.ref_file
                self.machinetime_table = pd.concat([self.machinetime_df, self.machinetime_table], ignore_index=True)

        except Exception as e:
            raise ValueError(f"Text format in Machine Time is not complatible with criteria. >>> {e}")

    ##################################
    ##### Loop through all files #####
    ##################################

    # Loop through all files in the extracted folder
    def loop_extract_transform(self):

        file_list = os.listdir(os.path.join(self.extracted_folder, self.zip_name))

        count_txt = 0

        self.msg_error = []

        for file_name in file_list:

            try:

                if file_name.endswith('.txt'):

                    count_txt += 1       

                    # The report every row of this file is tagged with: two reports can share a Charge
                    self.ref_file = file_name[:-4]

                    # Open each text file
                    file_path = os.path.join(self.extracted_folder, self.zip_name, file_name)
                    with open(file_path, 'r') as file:
                        text = file.read()

                    # Split the text into sections
                    text = text.split('\n')
                    self.detect_section(text)

                    # Split text into sections
                    sections = self.get_sections(text)

                    # ##### Extract each section #####
                    # Rows are found by a column that is always a whole number: Count (Article Number can be a
                    # material code, "SS400_3.2_2000_600 0") and Item (Tag can be "-"; 2026-11-09)
                    self.extract_used_mat(section=sections['used_material'],header=self.used_mat_head,key=1)
                    self.extract_nesting_info(sections['nesting'])
                    self.extract_order(section=sections['orders'],header=self.order_head,key=2)
                    self.sortout_plateusage(section=sections['plate_usage'],header=self.plate_usage_head)
                    if sections['remnants'] != []:
                        self.sortout_remnants(section=sections['remnants'],header=self.remnant_head,key=3)
                    self.sortout_machinetime(section=sections['machine_times'], header=self.machinetime_head)

                    # # Split the text into sections
                    # sections = text.split('\n\n')

                    # ##### Extract each section #####
                    # self.extract_used_mat(section=sections[1],header=self.used_mat_head,key=0)
                    # self.extract_nesting_info(sections[0])
                    # self.extract_order(section=sections[2],header=self.order_head,key=0)

                    # for sec in range(len(sections[2:])):
                    #     if "Plate usage" in sections[sec+2]:
                    #         self.sortout_plateusage(section=sections[sec+2],header=self.plate_usage_head)
                    #         break
                    
                    # # If there is a remnants section, sort out the remnants
                    # for sec in range(len(sections[2:])):
                    #     if "Remnants" in sections[sec+2]:
                    #         self.sortout_remnants(section=sections[sec+2],header=self.remnant_head,key=3)
                    #         break

                    # ### Extract Machine Time ####
                    # # If there is a machine time section, sort out the machine time
                    # for sec in range(len(sections[3:])):
                    #     if "Machine times" in sections[sec+4]:
                    #         self.sortout_machinetime(section=sections[sec+4],header=self.machinetime_head)
                    #         break

                elif file_name.endswith('.pdf'):
                    pass
                elif file_name.endswith('.xls'):
                    pass
                elif file_name.endswith('.dxf'):
                    pass
                else:
                    pass

            except Exception as e:

                self.msg_error.append({
                    'File name': file_name,
                    'Error message': str(e)})
                pass

        # Check if no any text file was found
        if count_txt == 0:
            raise ValueError("No text files found in the extracted folder.")

        # Check if any error messages were generated
        if self.msg_error != []:
            raise ReportFileErrors(self.msg_error)

    ######################################
    ##### ETL in Specific Dataframes #####
    ######################################

    # Merge the dataframes
    def merge_dataframes(self):

        try:
            # Charge + report: a plate re-nested from another plate's remnant keeps that plate's Charge
            keys = ['cuttingplan_number', 'source_file']
            self.merged_table = pd.merge(self.nesting_table, self.used_mat_table, on=keys)
            self.merged_table = pd.merge(self.merged_table, self.machinetime_table, on=keys)

        except Exception as e:
            raise ValueError(f"Error encountered while attempting to merge data. Message: {e}")

    # Clean up data in Order Part Dataframe
    def transform_order(self):

        try:
            split_columns = self.order_table['drawing_part_no_version_no'].str.split('/', expand=True)
            self.order_table['drawing_part_no_version_no'] = split_columns[0]
            self.order_table.drop(columns=['X'], inplace=True)

        except Exception as e:
            raise ValueError(f"Error encountered while attempting to transform order data. Message: {e}")

    # Clean up data in Order Part Dataframe
    def transform_remnants(self):

        try:

            split_columns = self.remnants_table['dimensions'].str.split(' ', expand=True)
            self.remnants_table['length_mm'] = split_columns[0]
            self.remnants_table['width_mm'] = split_columns[2]
            self.remnants_table.drop(columns=['dimensions'], inplace=True)

        except Exception as e:
            raise ValueError(f"Error encountered while attempting to transform remnants data. Message: {e}")

    # Add project infomtation in each dataframe 
    def add_project_info(self, project_info, df):

        try:

            self.project_info_name = []
            for key, value in project_info.items():
                self.project_info_name.append(key)
                df[key] = value

            return df
        
        except Exception as e:
            raise ValueError(f"""
                    Error encountered while attempting to add project information
                    Message: {e}
                """)

    # Reorganize columns in dataframes
    def reorganize_columns(self, df_name, df):

        try:

            # Reorganize column position in each dataframe
            cols_list = list(df.columns)
            desired_cols_nest = cols_list[-7:] + cols_list[:-7]
            df = df.reindex(columns=desired_cols_nest)

            if df_name == "remnants":
                # Reorganize column position in remnants
                desired_cols_rem = [
                    'file_id',
                    'project_code',
                    'project_name',
                    'tag',
                    'description',
                    'version',
                    'revision',
                    'plate_number',
                    'length_mm',
                    'width_mm',
                    'area_m2',
                    'weight_kg',
                    'count',
                    'ref_plate',
                    'ref_plate_seq',
                    'cuttingplan_number',
                    'source_file'
                ]
                df = df.reindex(columns=desired_cols_rem)
            # source_file goes last so the columns before it keep their positions
            if 'source_file' in df.columns:
                df = df[[c for c in df.columns if c != 'source_file'] + ['source_file']]
            return df
        
        except Exception as e:
            raise ValueError(f"""
                    Error encountered while attempting to reorganize columns
                    Message: {e}
                    """)

    # Change data type 'cuttingplan_number' to string in each dataframe
    # def change_data_type(self, df):
    #     df['cuttingplan_number'] = df['cuttingplan_number'].astype(str)
    #     return df
    
    # Store dataframes in a dictionary
    def store_dataframes(self):

        try:

            self.df_dict = {
                'nesting': self.merged_table,
                'order_part': self.order_table,
                'plate_usage': self.plate_usage_table,
                'remnants': self.remnants_table,
            }

        except Exception as e:
            raise ValueError(f"Error encountered while attempting to packing data. Message: {e}")

    ##############################
    ##### ETL each Datatable #####
    ##############################
    # Cleansing data for appending in Google Sheet

    # Replace NA and NaN to None
    def replace_na_to_none(self, table):
        self.cleaned_table = table.replace({pd.NA: None, np.nan: None})

    # convert elements in row to Python native types
    def convert_native_types(self):

        try:

            # pattern = re.compile(r'^\d{1,3}(,\d{3})*(\.\d+)?$')
            comma_decimal = re.compile(r'^\d{1,3}(,\d{3})*\.\d+$')
            comma_no_decimal = re.compile(r'^\d{1,3}(,\d{3})*$')
            decimal = re.compile(r'^\d+\.\d+$')
            no_decimal = re.compile(r'^\d+$')
            post_data = []

            for row in range(len(self.cleaned_table)):
                # alist = [int(x) if np.issubdtype(type(x), np.integer) else x for x in self.cleaned_table.iloc[row,:]]

                alist = []

                for x in self.cleaned_table.iloc[row, :]:
                    if np.issubdtype(type(x), np.integer):
                        alist.append(int(x))

                    elif comma_decimal.match(x):
                        alist.append(float(x.replace(',', '')))

                    elif comma_no_decimal.match(x):
                        alist.append(int(x.replace(',', '')))

                    elif decimal.match(x):
                        alist.append(float(x))

                    elif no_decimal.match(x):
                        alist.append(int(x))

                    else:
                        alist.append(x)

                post_data.append(alist)

            return post_data
        
        except Exception as e:
            raise ValueError(f"Error encountered while attempting to convert data types before posting data. Message: {e}")