export interface SampleDatasetInfo {
  id: string;
  name: string;
  fileName: string;
  category: "Customer" | "Sales" | "Employee";
  taskType: "classification" | "regression";
  recommendedTarget: string;
  description: string;
  rowCount: number;
  colCount: number;
  csvData: string;
}

export const SAMPLE_DATASETS: SampleDatasetInfo[] = [
  {
    id: "customer-churn",
    name: "Customer Churn & Retention",
    fileName: "customer_churn.csv",
    category: "Customer",
    taskType: "classification",
    recommendedTarget: "Churn",
    description: "Banking and telecom customer behavior including tenure, balance, activity, and churn outcome.",
    rowCount: 80,
    colCount: 9,
    csvData: `CustomerID,Age,TenureMonths,AccountBalance,NumProducts,HasCreditCard,IsActiveMember,EstimatedSalary,Churn
CUST_1001,42,2,0.00,1,1,1,101348.88,1
CUST_1002,41,1,83807.86,1,0,1,112542.58,0
CUST_1003,42,8,159660.80,3,1,0,113931.57,1
CUST_1004,39,1,0.00,2,0,0,93826.63,0
CUST_1005,43,2,125510.82,1,1,1,79084.10,0
CUST_1006,44,8,113755.78,2,1,0,149756.71,1
CUST_1007,50,7,0.00,2,1,1,10062.80,0
CUST_1008,29,4,115046.74,4,1,0,119346.88,1
CUST_1009,44,4,142051.07,2,0,1,74940.50,0
CUST_1010,27,2,134603.88,1,1,1,71725.73,0
CUST_1011,31,6,102016.72,2,0,0,80181.12,0
CUST_1012,24,3,0.00,2,1,0,76390.01,0
CUST_1013,48,10,93158.55,1,1,0,157532.79,0
CUST_1014,25,5,0.00,2,0,0,190857.79,0
CUST_1015,35,7,0.00,1,1,1,65951.65,0
CUST_1016,45,3,80262.91,1,0,1,6432.45,0
CUST_1017,58,1,132602.88,1,1,0,5097.67,1
CUST_1018,32,9,107818.63,1,1,1,15410.09,0
CUST_1019,28,8,118689.92,1,0,0,158684.81,0
CUST_1020,24,6,0.00,2,1,1,54724.03,0
CUST_1021,41,8,0.00,2,1,1,170886.17,0
CUST_1022,32,8,0.00,2,1,0,58561.31,0
CUST_1023,51,7,0.00,1,1,0,119296.05,1
CUST_1024,46,3,0.00,1,0,1,8487.75,1
CUST_1025,38,5,35005.60,1,1,1,90875.40,0
CUST_1026,25,3,0.00,2,0,1,137604.50,0
CUST_1027,36,6,136859.55,1,1,1,170041.95,0
CUST_1028,44,9,0.00,2,0,0,38433.35,0
CUST_1029,28,4,141349.43,1,1,1,157694.76,0
CUST_1030,37,4,0.00,2,1,1,81012.81,0
CUST_1031,39,3,117622.60,1,1,1,196859.60,0
CUST_1032,36,7,85311.70,1,0,1,156731.91,0
CUST_1033,41,9,110112.54,2,0,0,81898.81,0
CUST_1034,46,1,0.00,2,1,0,192772.12,0
CUST_1035,29,9,0.00,2,1,1,142033.07,0
CUST_1036,45,0,134266.92,1,1,0,27872.93,1
CUST_1037,34,1,145127.56,1,1,0,184125.78,0
CUST_1038,33,7,76548.60,1,0,1,98453.40,0
CUST_1039,36,7,0.00,1,0,0,40812.90,0
CUST_1040,41,2,70349.48,1,0,0,178088.04,0
CUST_1041,55,8,124578.10,1,1,0,145602.40,1
CUST_1042,47,4,119420.20,1,1,0,89123.80,1
CUST_1043,30,5,0.00,2,1,1,162400.10,0
CUST_1044,38,8,89543.20,1,0,1,114200.50,0
CUST_1045,52,3,142300.90,1,1,0,98700.20,1
CUST_1046,26,4,0.00,2,1,1,67500.00,0
CUST_1047,49,6,133400.70,1,1,0,181200.30,1
CUST_1048,33,7,92100.40,2,0,1,123400.90,0
CUST_1049,43,2,0.00,1,1,0,74200.10,0
CUST_1050,37,9,118900.50,1,1,1,159800.60,0
CUST_1051,56,4,139800.00,2,1,0,82100.40,1
CUST_1052,28,3,0.00,2,0,1,91200.00,0
CUST_1053,40,7,121000.30,1,1,1,141300.80,0
CUST_1054,61,5,152400.10,1,1,0,67800.20,1
CUST_1055,34,8,88300.90,2,0,1,112300.50,0
CUST_1056,44,2,0.00,1,1,0,129800.40,0
CUST_1057,32,6,104500.20,1,1,1,173400.10,0
CUST_1058,48,9,127600.80,2,0,0,189200.30,1
CUST_1059,29,5,0.00,2,1,1,84500.60,0
CUST_1060,53,3,146200.40,1,1,0,103400.90,1
CUST_1061,35,7,95400.10,1,0,1,135600.20,0
CUST_1062,31,4,0.00,2,1,1,78900.40,0
CUST_1063,47,8,131200.60,1,1,0,164500.80,1
CUST_1064,27,2,0.00,2,0,1,89400.10,0
CUST_1065,42,6,114700.50,2,1,1,148900.30,0
CUST_1066,59,4,158900.70,1,1,0,72400.50,1
CUST_1067,36,9,87600.30,1,0,1,121700.90,0
CUST_1068,38,3,0.00,2,1,0,134200.00,0
CUST_1069,50,7,143100.20,2,1,0,176500.40,1
CUST_1070,30,5,91800.60,1,0,1,99300.20,0
CUST_1071,45,2,0.00,1,1,0,115400.80,0
CUST_1072,33,8,108200.40,1,1,1,152300.60,0
CUST_1073,54,6,137500.90,1,1,0,84100.30,1
CUST_1074,26,3,0.00,2,0,1,76500.70,0
CUST_1075,41,9,123400.10,2,1,1,168900.20,0
CUST_1076,49,4,129800.50,1,0,0,143200.60,1
CUST_1077,35,6,0.00,2,1,1,93400.80,0
CUST_1078,57,5,161200.40,1,1,0,91200.10,1
CUST_1079,32,7,84900.20,1,0,1,107800.50,0
CUST_1080,43,1,0.00,1,1,0,126700.90,0`,
  },
  {
    id: "sales-revenue",
    name: "Retail Sales & Revenue Performance",
    fileName: "retail_sales.csv",
    category: "Sales",
    taskType: "regression",
    recommendedTarget: "Revenue",
    description: "Multichannel order transactions with dates, product categories, regions, discounts, and revenue totals.",
    rowCount: 80,
    colCount: 9,
    csvData: `TransactionID,OrderDate,Region,Category,UnitsSold,UnitPrice,DiscountPct,CustomerRating,Revenue
TRX-101,2024-01-05,North,Electronics,4,299.99,0.05,4.5,1139.96
TRX-102,2024-01-08,West,Apparel,12,45.00,0.10,4.2,486.00
TRX-103,2024-01-12,East,HomeGoods,3,150.00,0.00,4.8,450.00
TRX-104,2024-01-15,South,Electronics,8,499.00,0.15,3.9,3393.20
TRX-105,2024-01-19,North,OfficeSupplies,25,12.50,0.05,4.6,296.88
TRX-106,2024-01-22,West,HomeGoods,6,89.99,0.00,4.1,539.94
TRX-107,2024-01-26,East,Electronics,2,1200.00,0.10,4.9,2160.00
TRX-108,2024-01-29,South,Apparel,18,32.00,0.20,3.7,460.80
TRX-109,2024-02-02,North,Electronics,5,349.50,0.00,4.7,1747.50
TRX-110,2024-02-05,West,OfficeSupplies,40,8.75,0.15,4.3,297.50
TRX-111,2024-02-09,East,Apparel,9,65.00,0.05,4.4,555.75
TRX-112,2024-02-12,South,HomeGoods,4,210.00,0.10,4.0,756.00
TRX-113,2024-02-16,North,Electronics,7,550.00,0.05,4.8,3657.50
TRX-114,2024-02-20,West,Electronics,3,850.00,0.10,4.6,2295.00
TRX-115,2024-02-23,East,OfficeSupplies,30,15.00,0.00,4.2,450.00
TRX-116,2024-02-27,South,Apparel,15,42.00,0.15,3.8,535.50
TRX-117,2024-03-02,North,HomeGoods,5,175.00,0.05,4.5,831.25
TRX-118,2024-03-06,West,Electronics,6,420.00,0.00,4.9,2520.00
TRX-119,2024-03-10,East,Electronics,1,1500.00,0.05,4.7,1425.00
TRX-120,2024-03-14,South,OfficeSupplies,50,9.20,0.20,4.0,368.00
TRX-121,2024-03-18,North,Apparel,10,55.00,0.10,4.3,495.00
TRX-122,2024-03-22,West,HomeGoods,7,120.00,0.05,4.6,798.00
TRX-123,2024-03-26,East,Electronics,4,650.00,0.15,4.8,2210.00
TRX-124,2024-03-30,South,Electronics,5,380.00,0.10,4.1,1710.00
TRX-125,2024-04-03,North,OfficeSupplies,35,11.00,0.00,4.5,385.00
TRX-126,2024-04-07,West,Apparel,14,48.00,0.05,4.4,638.40
TRX-127,2024-04-11,East,HomeGoods,8,95.00,0.10,4.7,684.00
TRX-128,2024-04-15,South,Electronics,3,790.00,0.00,4.2,2370.00
TRX-129,2024-04-19,North,Electronics,9,310.00,0.10,4.6,2511.00
TRX-130,2024-04-23,West,OfficeSupplies,28,14.50,0.15,4.1,345.10
TRX-131,2024-04-27,East,Apparel,11,58.00,0.00,4.8,638.00
TRX-132,2024-05-01,South,HomeGoods,5,240.00,0.20,3.9,960.00
TRX-133,2024-05-05,North,Electronics,6,620.00,0.05,4.9,3534.00
TRX-134,2024-05-09,West,Electronics,4,480.00,0.10,4.5,1728.00
TRX-135,2024-05-13,East,OfficeSupplies,45,8.00,0.05,4.3,342.00
TRX-136,2024-05-17,South,Apparel,16,39.00,0.15,3.7,530.40
TRX-137,2024-05-21,North,HomeGoods,9,110.00,0.00,4.6,990.00
TRX-138,2024-05-25,West,Electronics,5,720.00,0.05,4.7,3420.00
TRX-139,2024-05-29,East,Electronics,2,1100.00,0.10,4.8,1980.00
TRX-140,2024-06-02,South,OfficeSupplies,60,7.50,0.20,4.0,360.00
TRX-141,2024-06-06,North,Apparel,13,62.00,0.10,4.4,725.40
TRX-142,2024-06-10,West,HomeGoods,6,165.00,0.05,4.5,940.50
TRX-143,2024-06-14,East,Electronics,7,450.00,0.15,4.9,2677.50
TRX-144,2024-06-18,South,Electronics,4,520.00,0.00,4.2,2080.00
TRX-145,2024-06-22,North,OfficeSupplies,32,13.00,0.05,4.6,395.20
TRX-146,2024-06-26,West,Apparel,20,35.00,0.10,4.3,630.00
TRX-147,2024-06-30,East,HomeGoods,4,225.00,0.00,4.7,900.00
TRX-148,2024-07-04,South,Electronics,5,690.00,0.15,4.1,2932.50
TRX-149,2024-07-08,North,Electronics,8,380.00,0.05,4.8,2888.00
TRX-150,2024-07-12,West,OfficeSupplies,42,10.50,0.10,4.2,396.90
TRX-151,2024-07-16,East,Apparel,8,72.00,0.05,4.5,547.20
TRX-152,2024-07-20,South,HomeGoods,6,180.00,0.20,3.8,864.00
TRX-153,2024-07-24,North,Electronics,3,950.00,0.00,4.9,2850.00
TRX-154,2024-07-28,West,Electronics,7,390.00,0.10,4.6,2457.00
TRX-155,2024-08-01,East,OfficeSupplies,38,12.00,0.05,4.4,433.20
TRX-156,2024-08-05,South,Apparel,17,44.00,0.15,3.9,635.80
TRX-157,2024-08-09,North,HomeGoods,5,190.00,0.10,4.7,855.00
TRX-158,2024-08-13,West,Electronics,6,540.00,0.05,4.8,3078.00
TRX-159,2024-08-17,East,Electronics,2,1350.00,0.10,4.9,2430.00
TRX-160,2024-08-21,South,OfficeSupplies,55,8.50,0.20,4.1,374.00
TRX-161,2024-08-25,North,Apparel,11,68.00,0.05,4.5,710.60
TRX-162,2024-08-29,West,HomeGoods,8,135.00,0.00,4.6,1080.00
TRX-163,2024-09-02,East,Electronics,5,580.00,0.15,4.8,2465.00
TRX-164,2024-09-06,South,Electronics,3,610.00,0.00,4.3,1830.00
TRX-165,2024-09-10,North,OfficeSupplies,36,11.50,0.05,4.6,393.30
TRX-166,2024-09-14,West,Apparel,15,46.00,0.10,4.2,621.00
TRX-167,2024-09-18,East,HomeGoods,7,140.00,0.10,4.7,882.00
TRX-168,2024-09-22,South,Electronics,4,740.00,0.15,4.0,2516.00
TRX-169,2024-09-26,North,Electronics,7,410.00,0.05,4.8,2726.50
TRX-170,2024-09-30,West,OfficeSupplies,48,9.80,0.10,4.3,423.36
TRX-171,2024-10-04,East,Apparel,10,64.00,0.00,4.6,640.00
TRX-172,2024-10-08,South,HomeGoods,5,215.00,0.20,3.9,860.00
TRX-173,2024-10-12,North,Electronics,4,820.00,0.05,4.9,3116.00
TRX-174,2024-10-16,West,Electronics,8,360.00,0.10,4.5,2592.00
TRX-175,2024-10-20,East,OfficeSupplies,40,13.50,0.05,4.4,513.00
TRX-176,2024-10-24,South,Apparel,19,38.00,0.15,3.8,613.70
TRX-177,2024-10-28,North,HomeGoods,6,160.00,0.00,4.6,960.00
TRX-178,2024-11-01,West,Electronics,5,660.00,0.05,4.8,3135.00
TRX-179,2024-11-05,East,Electronics,3,1050.00,0.10,4.9,2835.00
TRX-180,2024-11-09,South,OfficeSupplies,65,8.20,0.20,4.1,426.40`,
  },
  {
    id: "employee-attrition",
    name: "Employee Workforce & Retention",
    fileName: "employee_attrition.csv",
    category: "Employee",
    taskType: "classification",
    recommendedTarget: "Attrition",
    description: "HR demographics including department, job satisfaction, monthly income, years of experience, and attrition status.",
    rowCount: 80,
    colCount: 9,
    csvData: `EmployeeID,Age,Department,JobRole,MonthlyIncome,YearsAtCompany,WorkLifeBalance,PerformanceRating,Attrition
EMP-501,41,Sales,Sales Executive,5993,6,1,3,Yes
EMP-502,49,R&D,Research Scientist,5130,10,3,4,No
EMP-503,37,R&D,Laboratory Technician,2090,0,3,3,Yes
EMP-504,33,R&D,Research Scientist,2909,8,3,3,No
EMP-505,27,R&D,Laboratory Technician,3468,2,3,3,No
EMP-506,32,R&D,Laboratory Technician,3068,7,2,3,No
EMP-507,59,R&D,Laboratory Technician,2670,1,2,4,No
EMP-508,30,R&D,Laboratory Technician,2693,1,3,4,No
EMP-509,38,R&D,Manufacturing Director,9526,9,3,4,No
EMP-510,36,R&D,Healthcare Representative,5237,7,2,3,No
EMP-511,35,R&D,Laboratory Technician,2426,5,3,3,No
EMP-512,29,R&D,Laboratory Technician,4193,9,3,3,No
EMP-513,31,R&D,Research Scientist,2911,5,2,3,No
EMP-514,34,R&D,Laboratory Technician,2661,2,3,3,No
EMP-515,28,R&D,Laboratory Technician,2028,4,3,3,Yes
EMP-516,29,R&D,Manufacturing Director,9980,10,3,3,No
EMP-517,32,R&D,Research Scientist,3298,6,2,3,No
EMP-518,22,R&D,Laboratory Technician,2935,1,2,3,No
EMP-519,53,Sales,Sales Executive,15427,25,3,3,No
EMP-520,38,R&D,Research Scientist,3944,3,3,3,No
EMP-521,24,R&D,Manufacturing Director,4011,4,2,3,No
EMP-522,36,Sales,Sales Representative,3407,5,3,4,Yes
EMP-523,34,R&D,Research Director,11994,12,3,3,No
EMP-524,21,R&D,Research Scientist,1232,0,3,3,No
EMP-525,34,R&D,Research Scientist,2960,4,3,3,Yes
EMP-526,53,Sales,Manager,19094,14,2,3,No
EMP-527,32,R&D,Research Scientist,3919,10,3,4,Yes
EMP-528,42,Sales,Sales Executive,6825,9,2,3,No
EMP-529,44,R&D,Healthcare Representative,10248,22,4,3,No
EMP-530,46,Sales,Sales Executive,10448,2,2,3,No
EMP-531,33,R&D,Healthcare Representative,10748,9,3,3,No
EMP-532,44,R&D,Healthcare Representative,6465,3,4,3,No
EMP-533,30,R&D,Research Scientist,2206,10,2,3,No
EMP-534,39,Sales,Sales Executive,2086,1,3,3,Yes
EMP-535,24,R&D,Research Scientist,2293,2,2,3,Yes
EMP-536,43,R&D,Research Director,16064,20,3,3,No
EMP-537,50,Sales,Sales Executive,13194,22,3,3,Yes
EMP-538,35,Sales,Sales Representative,2014,2,3,3,No
EMP-539,36,R&D,Research Scientist,3407,1,2,3,No
EMP-540,33,Sales,Sales Executive,5376,5,3,3,No
EMP-541,35,R&D,Laboratory Technician,4941,1,3,3,No
EMP-542,27,R&D,Research Scientist,2683,5,3,3,No
EMP-543,26,HR,Human Resources,2994,4,2,3,Yes
EMP-544,27,R&D,Healthcare Representative,8726,9,3,3,No
EMP-545,30,Sales,Sales Executive,4011,5,3,3,No
EMP-546,41,R&D,Research Director,19545,5,3,3,No
EMP-547,34,Sales,Sales Executive,4538,5,3,3,No
EMP-548,37,R&D,Research Scientist,3047,1,2,3,No
EMP-549,46,Sales,Sales Executive,5860,8,3,4,No
EMP-550,35,Sales,Sales Executive,2269,1,2,3,No
EMP-551,48,R&D,Research Director,18213,22,2,3,Yes
EMP-552,28,R&D,Laboratory Technician,2564,2,3,3,Yes
EMP-553,44,Sales,Sales Executive,5454,4,3,3,No
EMP-554,35,R&D,Healthcare Representative,4200,9,3,3,No
EMP-555,26,R&D,Laboratory Technician,2135,1,2,3,No
EMP-556,26,Sales,Sales Representative,2741,4,3,3,Yes
EMP-557,35,Sales,Sales Executive,9069,10,3,3,No
EMP-558,35,R&D,Laboratory Technician,4014,7,3,3,No
EMP-559,31,R&D,Manufacturing Director,8726,7,3,3,No
EMP-560,36,R&D,Healthcare Representative,6883,6,3,3,No
EMP-561,32,R&D,Research Scientist,2741,2,2,3,No
EMP-562,38,R&D,Laboratory Technician,2406,1,3,3,No
EMP-563,50,R&D,Research Director,18740,17,2,3,No
EMP-564,59,Sales,Sales Executive,4717,3,3,3,No
EMP-565,36,Sales,Sales Executive,5084,1,2,3,No
EMP-566,33,R&D,Research Scientist,2799,3,3,3,No
EMP-567,36,R&D,Research Scientist,2642,4,3,3,No
EMP-568,45,R&D,Research Director,16799,24,2,3,No
EMP-569,32,Sales,Sales Executive,4680,5,3,3,No
EMP-570,36,HR,Human Resources,2743,3,3,3,No
EMP-571,30,R&D,Laboratory Technician,2576,2,3,3,No
EMP-572,38,Sales,Sales Executive,5324,10,3,3,No
EMP-573,31,R&D,Healthcare Representative,6410,9,3,3,No
EMP-574,29,Sales,Sales Representative,2600,1,2,3,Yes
EMP-575,32,R&D,Research Scientist,3038,5,3,3,No
EMP-576,48,R&D,Healthcare Representative,13577,15,3,3,No
EMP-577,35,R&D,Laboratory Technician,2258,2,3,3,No
EMP-578,41,R&D,Manufacturing Director,12000,11,3,3,No
EMP-579,28,R&D,Research Scientist,3210,3,2,3,No
EMP-580,39,R&D,Healthcare Representative,7850,8,3,3,No`,
  },
];
