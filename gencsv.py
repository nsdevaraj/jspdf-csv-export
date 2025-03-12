import csv
import random

# Data rows
departments = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations']
positions = ['Junior', 'Senior', 'Lead', 'Manager', 'Director']
statuses = ['Active', 'On Leave', 'Terminated', 'Suspended']
     

# Generate large CSV file (1000,000 rows)
with open('data/large.csv', 'w', newline='') as file:
    writer = csv.writer(file)
    # Header row
    writer.writerow(['ID', 'Name', 'Email', 'Department', 'Position', 'Salary', 'Start Date', 'Status', 'Notes'])
    
    # Data rows
    for i in range(1, 1000001):
        writer.writerow([
            i,
            f'Person {i}',
            f'person{i}@example.com',
            random.choice(departments),
            random.choice(positions),
            random.randint(30000, 150000),
            f'2025-{random.randint(1, 12):02d}-{random.randint(1, 28):02d}',
            random.choice(statuses),
            f'This is a longer text field with some additional notes about employee {i}. ' + 
            'It contains more characters to test how the PDF generator handles longer text content. ' +
            'The purpose is to ensure that text wrapping and cell sizing work correctly.'
        ])

print('Large CSV file generated successfully')