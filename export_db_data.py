#!/usr/bin/env python3
"""
Export all data from ResidentHive database tables to CSV files
"""
import asyncio
import asyncpg
import csv
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

class DatabaseExporter:
    def __init__(self):
        self.url = os.environ.get('RESIDENTHIVE_DATABASE_URL')
        if not self.url:
            raise ValueError("RESIDENTHIVE_DATABASE_URL not found in environment")
        self.connection = None
        self.export_dir = f"db_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    async def connect(self):
        """Connect to the database"""
        self.connection = await asyncpg.connect(self.url, ssl=True)
        print("✅ Connected to ResidentHive database")
    
    async def disconnect(self):
        """Disconnect from the database"""
        if self.connection:
            await self.connection.close()
            print("✅ Disconnected from database")
    
    async def get_all_tables(self):
        """Get list of all tables in the public schema"""
        query = """
            SELECT tablename, 
                   pg_size_pretty(pg_total_relation_size('public.'||tablename)) as size
            FROM pg_tables 
            WHERE schemaname = 'public' 
            ORDER BY tablename
        """
        tables = await self.connection.fetch(query)
        return [(table['tablename'], table['size']) for table in tables]
    
    async def get_table_row_count(self, table_name):
        """Get row count for a table"""
        try:
            result = await self.connection.fetchrow(f"SELECT COUNT(*) as count FROM {table_name}")
            return result['count']
        except Exception as e:
            print(f"❌ Error getting row count for {table_name}: {e}")
            return 0
    
    async def export_table_to_csv(self, table_name):
        """Export a single table to CSV"""
        try:
            print(f"📊 Exporting {table_name}...")
            
            # Get all data from the table
            rows = await self.connection.fetch(f"SELECT * FROM {table_name}")
            
            if not rows:
                print(f"  ⚠️  {table_name} is empty")
                return 0
            
            # Create CSV file
            csv_filename = os.path.join(self.export_dir, f"{table_name}.csv")
            
            with open(csv_filename, 'w', newline='', encoding='utf-8') as csvfile:
                # Get column names from the first row
                fieldnames = list(rows[0].keys())
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                
                # Write header
                writer.writeheader()
                
                # Write data rows
                for row in rows:
                    # Convert row to dict and handle special data types
                    row_dict = {}
                    for key, value in row.items():
                        if value is None:
                            row_dict[key] = ''
                        elif isinstance(value, datetime):
                            row_dict[key] = value.isoformat()
                        else:
                            row_dict[key] = str(value)
                    writer.writerow(row_dict)
            
            print(f"  ✅ Exported {len(rows)} rows to {csv_filename}")
            return len(rows)
            
        except Exception as e:
            print(f"  ❌ Error exporting {table_name}: {e}")
            return 0
    
    async def export_all_tables(self):
        """Export all tables to CSV files"""
        # Create export directory
        os.makedirs(self.export_dir, exist_ok=True)
        print(f"📁 Created export directory: {self.export_dir}")
        
        await self.connect()
        
        # Get all tables
        tables = await self.get_all_tables()
        print(f"📋 Found {len(tables)} tables to export")
        
        total_rows = 0
        export_summary = []
        
        # Export each table
        for table_name, size in tables:
            row_count = await self.get_table_row_count(table_name)
            exported_rows = await self.export_table_to_csv(table_name)
            
            # Handle None return value
            if exported_rows is None:
                exported_rows = 0
            
            export_summary.append({
                'table': table_name,
                'size': size,
                'rows': row_count,
                'exported': exported_rows
            })
            total_rows += exported_rows
        
        # Create summary report
        summary_filename = os.path.join(self.export_dir, "export_summary.txt")
        with open(summary_filename, 'w') as f:
            f.write("ResidentHive Database Export Summary\n")
            f.write("=" * 50 + "\n")
            f.write(f"Export Date: {datetime.now().isoformat()}\n")
            f.write(f"Total Tables: {len(tables)}\n")
            f.write(f"Total Rows Exported: {total_rows:,}\n\n")
            
            f.write("Table Details:\n")
            f.write("-" * 50 + "\n")
            for item in export_summary:
                f.write(f"{item['table']:<30} {item['size']:<10} {item['rows']:>8} rows\n")
        
        print(f"\n📊 Export Summary:")
        print(f"  • Total tables exported: {len(tables)}")
        print(f"  • Total rows exported: {total_rows:,}")
        print(f"  • Export directory: {self.export_dir}")
        print(f"  • Summary report: {summary_filename}")
        
        await self.disconnect()
        return self.export_dir

async def main():
    """Main export function"""
    print("🗃️  ResidentHive Database Export Tool")
    print("=" * 50)
    
    try:
        exporter = DatabaseExporter()
        export_dir = await exporter.export_all_tables()
        
        print(f"\n✅ Export complete!")
        print(f"📁 All data saved to: {export_dir}")
        print(f"💡 You can now inspect the CSV files in this directory")
        
        # List the exported files
        print(f"\n📄 Exported files:")
        for filename in sorted(os.listdir(export_dir)):
            if filename.endswith('.csv'):
                filepath = os.path.join(export_dir, filename)
                file_size = os.path.getsize(filepath)
                print(f"  • {filename} ({file_size:,} bytes)")
        
    except Exception as e:
        print(f"❌ Export failed: {e}")

if __name__ == '__main__':
    asyncio.run(main())