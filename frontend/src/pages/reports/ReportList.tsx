import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { SearchIcon, FilterIcon, DownloadIcon } from 'lucide-react';
export const ReportList = () => {
  const {
    user
  } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState(false);
  // Mock report data
  const reports = [{
    id: '1',
    title: 'Course Progress Report',
    course: 'Machine Learning Fundamentals',
    date: '2023-10-10',
    type: 'progress'
  }, {
    id: '2',
    title: 'Attendance Summary',
    course: 'Database Systems',
    date: '2023-10-09',
    type: 'attendance'
  }, {
    id: '3',
    title: 'Quiz Results',
    course: 'Advanced Programming Techniques',
    date: '2023-10-11',
    type: 'assessment'
  }, {
    id: '4',
    title: 'Midterm Exam Results',
    course: 'Data Structures and Algorithms',
    date: '2023-10-08',
    type: 'assessment'
  }, {
    id: '5',
    title: 'Course Feedback Summary',
    course: 'Web Development',
    date: '2023-10-07',
    type: 'feedback'
  }];
  // Filter reports based on search term
  const filteredReports = reports.filter(report => report.title.toLowerCase().includes(searchTerm.toLowerCase()) || report.course.toLowerCase().includes(searchTerm.toLowerCase()) || report.type.toLowerCase().includes(searchTerm.toLowerCase()));
  return <div className="py-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Reports</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {user?.role === 'student' ? 'View your academic reports and progress' : 'Access and generate reports for courses and students'}
          </p>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
        {/* Search and filter */}
        <div className="px-4 py-5 border-b border-gray-200 dark:border-gray-700 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between">
            <div className="relative rounded-md shadow-sm max-w-xs">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <SearchIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
              </div>
              <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search reports..." className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400" />
            </div>
            <div className="mt-3 sm:mt-0 flex space-x-2">
              <button type="button" onClick={() => setFilterActive(!filterActive)} className={`inline-flex items-center px-3 py-2 border ${filterActive ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'} rounded-md text-sm font-medium bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}>
                <FilterIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
                Filter
              </button>
            </div>
          </div>
          {/* Filter options - hidden by default */}
          {filterActive && <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="type" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Report Type
                </label>
                <select id="type" name="type" className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:text-gray-100" defaultValue="all">
                  <option value="all">All Types</option>
                  <option value="progress">Progress</option>
                  <option value="attendance">Attendance</option>
                  <option value="assessment">Assessment</option>
                  <option value="feedback">Feedback</option>
                </select>
              </div>
              <div>
                <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Date Range
                </label>
                <select id="date" name="date" className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:text-gray-100" defaultValue="all">
                  <option value="all">All Dates</option>
                  <option value="week">Last 7 days</option>
                  <option value="month">Last 30 days</option>
                  <option value="quarter">Last 3 months</option>
                </select>
              </div>
              <div className="flex items-end">
                <button type="button" className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                  Apply Filters
                </button>
              </div>
            </div>}
        </div>
        {/* Reports list */}
        <div className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Report
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Course
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Date
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredReports.map(report => <tr key={report.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                        <Link to={`/dashboard/${user?.role}/reports/${report.id}`}>
                          {report.title}
                        </Link>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {report.course}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-gray-100">{report.date}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${report.type === 'progress' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : report.type === 'attendance' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : report.type === 'assessment' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'}`}>
                        {report.type.charAt(0).toUpperCase() + report.type.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-3">
                        <Link to={`/dashboard/${user?.role}/reports/${report.id}`} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300">
                          View
                        </Link>
                        <button className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
                          <DownloadIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>
          {filteredReports.length === 0 && <div className="px-6 py-10 text-center">
              <p className="text-gray-500 dark:text-gray-400">No reports found</p>
            </div>}
        </div>
      </div>
    </div>;
};
