'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useRouter, useParams } from 'next/navigation'
import Image from 'next/image'
import { getAppSettings, getYearCollectionName } from '@/lib/services/settingsService'
import { getCommitteesForYear, Committee } from '@/lib/services/committeeService'
import { getFacultiesByYear } from '@/lib/services/facultyService'
import { getAllStudents, Student } from '@/lib/services/studentService'
import { getBaseCommittees, BaseCommittee } from '@/lib/services/committeeService'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { doc, deleteDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase/config'
import { signOut } from 'firebase/auth'

type ColumnKey = 'regno' | 'name' | 'email' | 'phone' | 'department' | 'hostel' | 'roomNumber' | 'committee' | 'category' | 'status'

interface ColumnDefinition {
  key: ColumnKey
  label: string
  defaultSelected: boolean
}

const AVAILABLE_COLUMNS: ColumnDefinition[] = [
  { key: 'regno', label: 'Reg No', defaultSelected: true },
  { key: 'name', label: 'Name', defaultSelected: true },
  { key: 'email', label: 'Email', defaultSelected: true },
  { key: 'phone', label: 'Phone', defaultSelected: true },
  { key: 'department', label: 'Department', defaultSelected: true },
  { key: 'hostel', label: 'Hostel', defaultSelected: true },
  { key: 'roomNumber', label: 'Room No', defaultSelected: false },
  { key: 'committee', label: 'Committee', defaultSelected: true },
  { key: 'category', label: 'Category', defaultSelected: true },
  { key: 'status', label: 'Status', defaultSelected: false }
]

// Modal Component
interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  message: string
  type: 'success' | 'error'
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, message, type }) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm" 
        onClick={onClose}
      />
      <div className="relative bg-white/5 backdrop-blur-xl border border-white/20 rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl animate-scale-in">
        <div className="flex justify-center mb-6">
          {type === 'success' ? (
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400/60 flex items-center justify-center">
              <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-400/60 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          )}
        </div>
        <h3 className="text-2xl font-bold text-white text-center mb-3">{title}</h3>
        <p className="text-white/80 text-center mb-8 leading-relaxed">{message}</p>
        <button
          onClick={onClose}
          className={`w-full py-3 px-6 rounded-xl font-semibold transition-all duration-200 ${
            type === 'success' 
              ? 'bg-emerald-500 hover:bg-emerald-600 text-white' 
              : 'bg-red-500 hover:bg-red-600 text-white'
          }`}
        >
          OK
        </button>
      </div>
    </div>
  )
}

export default function CommitteeFacultySearchPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const committeeKey = params.key as string

  const [currentYear, setCurrentYear] = useState<string | null>(null)
  const [committee, setCommittee] = useState<Committee | null>(null)
  const [departments, setDepartments] = useState<string[]>([])
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  // Search page states
  const [loading, setLoading] = useState(true)
  const [allStudents, setAllStudents] = useState<Student[]>([])
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([])
  const [committees, setCommittees] = useState<BaseCommittee[]>([])

  // Column selection
  const [selectedColumns, setSelectedColumns] = useState<Set<ColumnKey>>(
    new Set(AVAILABLE_COLUMNS.filter(col => col.defaultSelected).map(col => col.key))
  )
  const [showColumnSelector, setShowColumnSelector] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDepartment, setSelectedDepartment] = useState('')
  const [selectedHostel, setSelectedHostel] = useState('')
  const [selectedCommitteeFilter, setSelectedCommitteeFilter] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'scholarship' | 'normal'>('all')

  // Pagination & Sort
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)
  const [sortField, setSortField] = useState<keyof Student>('regno')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Selection
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set())
  const [selectAllPages, setSelectAllPages] = useState(false)

  // Modals
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [editForm, setEditForm] = useState<Student | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Messages
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Auth Modal
  const [modalState, setModalState] = useState<{
    isOpen: boolean
    title: string
    message: string
    type: 'success' | 'error'
  }>({ isOpen: false, title: '', message: '', type: 'success' })

  const showModal = (title: string, message: string, type: 'success' | 'error') => {
    setModalState({ isOpen: true, title, message, type })
  }

  const closeModal = () => {
    setModalState(prev => ({ ...prev, isOpen: false }))
  }

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push('/login')
      return
    }
    if (committeeKey) {
      checkAuthAndLoadData()
    }
  }, [user, authLoading, committeeKey, router])

  const checkAuthAndLoadData = async () => {
    try {
      const settings = await getAppSettings()
      if (!settings?.currentYear) {
        showModal('Error', 'No active year configured.', 'error')
        setTimeout(() => router.push('/login'), 2000)
        return
      }

      setCurrentYear(settings.currentYear)
      setDepartments(settings.departments || [])

      // Get committees for this year
      const allCommittees = await getCommitteesForYear(settings.currentYear)
      const foundCommittee = allCommittees.find(c => c?.key === committeeKey)

      if (!foundCommittee) {
        showModal('Error', `Committee ${committeeKey} not found for this year.`, 'error')
        setTimeout(() => router.push('/faculty/dashboard'), 2000)
        return
      }

      setCommittee(foundCommittee)

      // Faculty authorization
      const faculties = await getFacultiesByYear(settings.currentYear)
      if (!Array.isArray(faculties) || faculties.length === 0) {
        showModal('Access Denied', 'Unable to load faculty data.', 'error')
        setTimeout(() => router.push('/faculty/dashboard'), 2000)
        return
      }

      const faculty = faculties.find(f => f?.email === user?.email)
      if (!faculty) {
        showModal('Access Denied', 'You are not assigned to any committees.', 'error')
        setTimeout(() => router.push('/faculty/dashboard'), 2000)
        return
      }

      const committeesList = Array.isArray(faculty.committees) ? faculty.committees : []
      if (!committeesList.includes(committeeKey)) {
        showModal('Access Denied', 'You are not authorized to access this committee.', 'error')
        setTimeout(() => router.push('/faculty/dashboard'), 2000)
        return
      }

      setIsAuthorized(true)
      await loadSearchData(settings.currentYear)
    } catch (error) {
      console.error('Failed to load settings:', error)
      showModal('Error', 'Failed to load configuration.', 'error')
    }
  }

  const loadSearchData = async (year: string) => {
    try {
      setLoading(true)
      setError(null)

      const [students, baseCommittees] = await Promise.all([
        getAllStudents(year),
        getBaseCommittees()
      ])

      setAllStudents(students)
      setFilteredStudents(students.filter(s => s.committee === committeeKey))
      setCommittees(baseCommittees)

      setSuccess('Data loaded successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch (error) {
      console.error('Failed to load search data:', error)
      setError('Failed to load student data.')
    } finally {
      setLoading(false)
    }
  }

  const getCommitteeName = useCallback((key: string): string => {
    if (!key) return 'Unknown'
    const committee = committees.find(c => c.key === key)
    return committee?.name || key
  }, [committees])

  const formatStatus = (status?: string): string => {
    if (!status) return 'Unknown'
    return status.charAt(0).toUpperCase() + status.slice(1)
  }

  const getCellValue = (student: Student, columnKey: ColumnKey): string => {
    switch (columnKey) {
      case 'regno': return student?.regno || 'N/A'
      case 'name': return student?.name || 'Unknown'
      case 'email': return student?.email || ''
      case 'phone': return student?.phone || ''
      case 'department': return student?.department || ''
      case 'hostel': return student?.hostel || ''
      case 'roomNumber': return student?.roomNumber || ''
      case 'committee': return getCommitteeName(student?.committee || '')
      case 'category': return student?.category === 'scholarship' ? 'Scholarship' : 'Normal'
      case 'status': return formatStatus(student?.status)
      default: return ''
    }
  }

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true)
      await signOut(auth)
      router.push('/login')
      router.refresh()
    } catch (error) {
      console.error('Logout failed:', error)
      alert('Failed to logout. Please try again.')
    } finally {
      setIsLoggingOut(false)
    }
  }

  // Apply filters
  useEffect(() => {
    let filtered = [...allStudents].filter(s => s.committee === committeeKey)

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(student =>
        student?.regno?.toLowerCase().includes(query) ||
        student?.name?.toLowerCase().includes(query) ||
        student?.email?.toLowerCase().includes(query) ||
        student?.phone?.toLowerCase().includes(query)
      )
    }

    if (selectedDepartment) {
      filtered = filtered.filter(s => s?.department === selectedDepartment)
    }

    if (selectedHostel) {
      filtered = filtered.filter(s => s?.hostel === selectedHostel)
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter(s => s?.status === selectedStatus)
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(s => s?.category === categoryFilter)
    }

    setFilteredStudents(filtered)
    setCurrentPage(1)
    setSelectAllPages(false)
    setSelectedStudents(new Set())
  }, [searchQuery, selectedDepartment, selectedHostel, selectedStatus, categoryFilter, allStudents, committeeKey])

  const sortedStudents = useMemo(() => {
    return [...filteredStudents].sort((a, b) => {
      const aValue = (a[sortField as keyof Student] as string)?.toString().toLowerCase()
      const bValue = (b[sortField as keyof Student] as string)?.toString().toLowerCase()

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredStudents, sortField, sortDirection])

  const paginatedStudents = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return sortedStudents.slice(startIndex, endIndex)
  }, [sortedStudents, currentPage, itemsPerPage])

  const totalPages = Math.ceil(sortedStudents.length / itemsPerPage)

  const handleSort = (field: keyof Student) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const handleToggleColumn = (columnKey: ColumnKey) => {
    const newSelected = new Set(selectedColumns)
    if (newSelected.has(columnKey)) {
      if (newSelected.size === 1) return
      newSelected.delete(columnKey)
    } else {
      newSelected.add(columnKey)
    }
    setSelectedColumns(newSelected)
  }

  const handleSelectAllPages = () => {
    if (selectAllPages) {
      setSelectedStudents(new Set())
      setSelectAllPages(false)
    } else {
      const allRegNos = sortedStudents.map(s => s.regno).filter(Boolean) as string[]
      setSelectedStudents(new Set(allRegNos))
      setSelectAllPages(true)
    }
  }

  const handleSelectCurrentPage = () => {
    const currentPageRegNos = paginatedStudents.map(s => s.regno).filter(Boolean) as string[]
    const allSelected = currentPageRegNos.every(regno => selectedStudents.has(regno))

    const newSelected = new Set(selectedStudents)
    if (allSelected) {
      currentPageRegNos.forEach(regno => newSelected.delete(regno))
    } else {
      currentPageRegNos.forEach(regno => newSelected.add(regno))
    }

    setSelectedStudents(newSelected)
    if (newSelected.size === sortedStudents.length) {
      setSelectAllPages(true)
    } else {
      setSelectAllPages(false)
    }
  }

  const handleSelectStudent = (regno: string) => {
    const newSelected = new Set(selectedStudents)
    if (newSelected.has(regno)) {
      newSelected.delete(regno)
    } else {
      newSelected.add(regno)
    }
    setSelectedStudents(newSelected)

    if (newSelected.size === sortedStudents.length) {
      setSelectAllPages(true)
    } else {
      setSelectAllPages(false)
    }
  }

  const exportToCSV = async () => {
    setExporting(true)
    try {
      const columnsToExport = Array.from(selectedColumns)
      const headers = columnsToExport.map(key => 
        AVAILABLE_COLUMNS.find(col => col.key === key)?.label || key
      )

      const csvRows = [headers.join(',')]
      const dataToExport = selectedStudents.size === 0 
        ? sortedStudents 
        : sortedStudents.filter(s => selectedStudents.has(s.regno!))

      dataToExport.forEach(student => {
        const row = columnsToExport.map(key => {
          const value = getCellValue(student, key)
          return value.includes(',') || value.includes('"') || value.includes('\n') 
            ? `"${value.replace(/"/g, '""')}"`
            : value
        })
        csvRows.push(row.join(','))
      })

      const csvContent = csvRows.join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `committee-${committeeKey}-${currentYear}-${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      setSuccess('CSV exported successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      console.error('CSV export error:', err)
      setError('Failed to export CSV. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const exportToPDF = async () => {
    setExporting(true)
    try {
      const doc = new jsPDF('l', 'mm', 'a4')

      // Header
      doc.setFillColor(16, 185, 129)
      doc.rect(0, 0, 297, 40, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(22)
      doc.setFont('helvetica', 'bold')
      doc.text(`${committee?.name} Students Report`, 15, 15)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 15, 23)
      doc.text(`Academic Year: ${currentYear}`, 15, 28)
      doc.text(`Total Students: ${sortedStudents.length}${selectedStudents.size === 0 ? '' : ` (Selected: ${selectedStudents.size})`}`, 15, 33)

      const columnsToExport = Array.from(selectedColumns)
      const tableHeaders = columnsToExport.map(key => 
        AVAILABLE_COLUMNS.find(col => col.key === key)?.label || key
      )

      const dataToExport = selectedStudents.size === 0 
        ? sortedStudents 
        : sortedStudents.filter(s => selectedStudents.has(s.regno!))

      const tableData = dataToExport.map(student =>
        columnsToExport.map(key => getCellValue(student, key))
      )

      const tableWidth = 277
      const columnWidth = tableWidth / columnsToExport.length
      const columnStyles: any = {}
      columnsToExport.forEach((_, index) => {
        columnStyles[index] = { cellWidth: columnWidth }
      })

      autoTable(doc, {
        head: [tableHeaders],
        body: tableData,
        startY: 45,
        theme: 'grid',
        headStyles: {
          fillColor: [16, 185, 129],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 9,
          cellPadding: 3
        },
        styles: {
          fontSize: 8,
          cellPadding: 2.5,
          lineColor: [220, 220, 220],
          lineWidth: 0.1
        },
        alternateRowStyles: {
          fillColor: [245, 247, 250]
        },
        columnStyles,
        didDrawPage: (data) => {
          const pageCount = doc.getNumberOfPages()
          const pageSize = doc.internal.pageSize
          const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight()
          const pageWidth = pageSize.width ? pageSize.width : pageSize.getWidth()

          // Footer
          doc.setFillColor(240, 240, 240)
          doc.rect(0, pageHeight - 15, pageWidth, 15, 'F')
          doc.setTextColor(100, 100, 100)
          doc.setFontSize(8)
          doc.text(`Page ${data.pageNumber} of ${pageCount}`, 15, pageHeight - 8)
          doc.text('Generated by Committee Faculty Portal', pageWidth - 15, pageHeight - 8, { align: 'right' })
        }
      })

      doc.save(`committee-${committeeKey}-${currentYear}-${new Date().toISOString().split('T')[0]}.pdf`)

      setSuccess('PDF exported successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      console.error('PDF export error:', err)
      setError('Failed to export PDF. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const handleViewDetails = (student: Student) => {
    setSelectedStudent(student)
    setShowDetailsModal(true)
  }

  const handleEditStudent = (student: Student) => {
    setEditForm({ ...student })
    setShowDetailsModal(false)
    setShowEditModal(true)
  }

  const handleDeleteStudent = (student: Student) => {
    setSelectedStudent(student)
    setShowDetailsModal(false)
    setShowDeleteModal(true)
  }

  const confirmDeleteStudent = async () => {
    if (!selectedStudent || !currentYear) return

    setDeleting(true)
    try {
      const studentsCol = getYearCollectionName('students', currentYear)
      const attendanceCol = getYearCollectionName('attendance', currentYear)

      const studentRef = doc(db, studentsCol, selectedStudent.regno!)
      await deleteDoc(studentRef)

      const attendanceQuery = query(
        collection(db, attendanceCol),
        where('regno', '==', selectedStudent.regno)
      )
      const attendanceSnapshot = await getDocs(attendanceQuery)
      const deletePromises = attendanceSnapshot.docs.map(docSnapshot =>
        deleteDoc(doc(db, attendanceCol, docSnapshot.id))
      )
      await Promise.all(deletePromises)

      setAllStudents(prev => prev.filter(s => s.regno !== selectedStudent.regno))
      setSuccess(`Student ${selectedStudent.regno} and ${attendanceSnapshot.size} attendance records deleted successfully`)
      setTimeout(() => setSuccess(null), 3000)
      setShowDeleteModal(false)
      setSelectedStudent(null)
    } catch (error) {
      console.error('Failed to delete student:', error)
      setError('Failed to delete student. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!editForm || !currentYear) return

    setSaving(true)
    try {
      const colName = getYearCollectionName('students', currentYear)
      const studentRef = doc(db, colName, editForm.regno!)
      await updateDoc(studentRef, {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone,
        department: editForm.department,
        hostel: editForm.hostel,
        roomNumber: editForm.roomNumber,
        category: editForm.category || 'normal'
      })

      setAllStudents(prev =>
        prev.map(s => s.regno === editForm.regno ? editForm : s)
      )
      setSuccess('Student details updated successfully')
      setTimeout(() => setSuccess(null), 3000)
      setShowEditModal(false)
      setEditForm(null)
    } catch (error) {
      console.error('Failed to update student:', error)
      setError('Failed to update student details.')
    } finally {
      setSaving(false)
    }
  }

  const uniqueDepartments = Array.from(new Set(allStudents.map(s => s?.department).filter(Boolean))).sort()
  const uniqueHostels = Array.from(new Set(allStudents.map(s => s?.hostel).filter(Boolean))).sort()

  if (authLoading || loading) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p>Loading committee search...</p>
      </div>
    </div>
  )
}


  if (!user || !isAuthorized || !committee) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      <div className="text-center">
        <p className="text-red-400 mb-4">Unauthorized Access</p>
        <button
          onClick={() => router.push('/faculty/dashboard')}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-xl"
        >
          Go to Faculty Dashboard
        </button>
      </div>
    </div>
  )
}


  return (
    <div className="min-h-screen relative overflow-hidden bg-[#000000]">
      {/* Background System */}
      <div className="fixed inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#050508] to-[#000000]"></div>
      <div className="fixed top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(147,51,234,0.08),transparent_50%)]"></div>
      
      {/* Animated Blobs */}
      <div className="fixed top-0 -left-40 w-[500px] h-[500px] bg-purple-500/12 rounded-full blur-[110px]"></div>
      <div className="fixed bottom-0 -right-40 w-[500px] h-[500px] bg-pink-500/12 rounded-full blur-[110px]"></div>
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-indigo-500/8 rounded-full blur-[90px]"></div>

      {/* Content Layer */}
      <div className="relative z-10">
        {/* Auth Modal */}
        <Modal
          isOpen={modalState.isOpen}
          onClose={closeModal}
          title={modalState.title}
          message={modalState.message}
          type={modalState.type}
        />

        {/* Header */}
        <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
    <div className="flex items-center justify-between gap-2">
      {/* Left Section: Back Button, Logo, and Title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {/* Back Button */}
        <button
          onClick={() => router.push(`/faculty/committee/${committeeKey}/dashboard`)}
          className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors flex-shrink-0"
          title="Back to Committee Dashboard"
        >
          <svg
            className="w-4 h-4 sm:w-5 sm:h-5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>

        {/* Logo - Hidden on small mobile */}
        <div className="hidden xs:flex items-center justify-center flex-shrink-0">
          <Image
            src="/klo2.svg"
            alt="Logo"
            width={40}
            height={40}
            className="drop-shadow-2xl sm:w-[55px] sm:h-[55px]"
          />
        </div>

        {/* Title Section */}
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-xl md:text-2xl font-bold bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent truncate">
            {committee.name} Students
          </h1>
          <p className="text-[10px] sm:text-xs text-purple-400 font-medium truncate">
            <span className="hidden sm:inline">Committee Faculty Portal • Year {currentYear || 'N/A'} • </span>
            {sortedStudents.length} students
          </p>
        </div>
      </div>

      {/* Right Section: User Info and Logout */}
      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        {/* User Info - Hidden on mobile/tablet */}
        <div className="hidden lg:block text-right">
          <p className="text-sm text-white/80 truncate max-w-[200px]">{user?.email}</p>
          <p className="text-xs text-white/50 mt-0.5">Faculty Member</p>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white text-xs sm:text-sm font-medium rounded-lg sm:rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {isLoggingOut ? (
            <span className="flex items-center gap-1.5 sm:gap-2">
              <svg
                className="w-3 h-3 sm:w-4 sm:h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="hidden sm:inline">Logging out...</span>
            </span>
          ) : (
            'Logout'
          )}
        </button>
      </div>
    </div>
  </div>
</header>


        <main className="max-w-7xl mx-auto px-6 py-10 animate-[fadeInUp_0.7s_ease-out]">
          {/* Messages */}
          {error && (
            <div className="rounded-2xl bg-red-500/10 border border-red-500/40 px-4 py-3 mb-6 text-sm text-red-100">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/40 px-4 py-3 mb-6 text-sm text-emerald-100">
              {success}
            </div>
          )}

          {/* Column Selection */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                Display Columns ({selectedColumns.size}/{AVAILABLE_COLUMNS.length})
              </h2>
              <button
                onClick={() => setShowColumnSelector(!showColumnSelector)}
                className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-sm font-semibold rounded-xl transition-all shadow-lg flex items-center gap-2"
              >
                {showColumnSelector ? 'Hide' : 'Manage'} Columns
              </button>
            </div>
            
            {showColumnSelector && (
              <div className="bg-black/20 rounded-2xl p-5 border border-white/10 mt-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-white/70">Select columns to display in table and exports</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {AVAILABLE_COLUMNS.map(column => (
                    <label 
                      key={column.key} 
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                        selectedColumns.has(column.key)
                          ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedColumns.has(column.key)}
                        onChange={() => handleToggleColumn(column.key)}
                        disabled={selectedColumns.size === 1 && selectedColumns.has(column.key)}
                        className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400"
                      />
                      <span className="text-sm font-medium">{column.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Search & Filters */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl mb-8">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search & Filter Students
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
              {/* Search */}
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-white mb-2">Search (RegNo/Name/Email/Phone)</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="e.g., 21EUCS001, John Doe"
                  className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Department */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">Department</label>
                <select
                  value={selectedDepartment}
                  onChange={e => setSelectedDepartment(e.target.value)}
                  className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option className="bg-slate-800 text-white" value="">All Departments</option>
                  {departments.map(dept => (
                    <option className="bg-slate-800 text-white" key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              {/* Hostel */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">Hostel</label>
                <select
                  value={selectedHostel}
                  onChange={e => setSelectedHostel(e.target.value)}
                  className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option className="bg-slate-800 text-white" value="">All Hostels</option>
                  {uniqueHostels.slice(0, 10).map(hostel => (
                    <option className="bg-slate-800 text-white" key={hostel} value={hostel}>{hostel}</option>
                  ))}
                </select>
              </div>

              {/* Items Per Page */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">Items Per Page</label>
                <select
                  value={itemsPerPage}
                  onChange={e => {
                    setItemsPerPage(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option className="bg-slate-800 text-white" value={10}>10</option>
                  <option className="bg-slate-800 text-white" value={25}>25</option>
                  <option className="bg-slate-800 text-white" value={50}>50</option>
                  <option className="bg-slate-800 text-white" value={100}>100</option>
                  <option className="bg-slate-800 text-white" value={sortedStudents.length}>All ({sortedStudents.length})</option>
                </select>
              </div>
            </div>

            {/* Category & Status Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-white mb-3">Category</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setCategoryFilter('all')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex-1 ${
                      categoryFilter === 'all'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                        : 'bg-white/5 text-white/80 border border-white/20 hover:bg-white/10'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setCategoryFilter('scholarship')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex-1 ${
                      categoryFilter === 'scholarship'
                        ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/30'
                        : 'bg-white/5 text-white/80 border border-white/20 hover:bg-white/10'
                    }`}
                  >
                    Scholarship
                  </button>
                  <button
                    onClick={() => setCategoryFilter('normal')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex-1 ${
                      categoryFilter === 'normal'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                        : 'bg-white/5 text-white/80 border border-white/20 hover:bg-white/10'
                    }`}
                  >
                    Normal
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-3">Status</label>
                <div className="flex gap-2 flex-wrap">
                  {['all', 'pending', 'approved', 'rejected'].map(status => (
                    <button
                      key={status}
                      onClick={() => setSelectedStatus(status as any)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium transition-all flex-1 min-w-[70px] ${
                        selectedStatus === status
                          ? status === 'all'
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                            : status === 'pending'
                            ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/30'
                            : status === 'approved'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                            : 'bg-red-500/20 text-red-300 border border-red-400/30'
                          : 'bg-white/5 text-white/80 border border-white/20 hover:bg-white/10'
                      }`}
                    >
                      {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Filter Summary */}
            {(searchQuery || selectedDepartment || selectedHostel || selectedStatus !== 'all' || categoryFilter !== 'all') && (
              <div className="mt-6 pt-6 border-t border-white/10 flex items-center justify-between">
                <p className="text-sm text-purple-200">
                  Showing <span className="font-semibold">{filteredStudents.length}</span> of{' '}
                  <span className="font-semibold">{allStudents.filter(s => s.committee === committeeKey).length}</span>{' '}
                  {committee.name} students
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setSelectedDepartment('')
                    setSelectedHostel('')
                    setSelectedStatus('all')
                    setCategoryFilter('all')
                  }}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-xl transition-all flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear Filters
                </button>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 mb-8">
            <button
              onClick={handleSelectAllPages}
              className={`px-6 py-3 rounded-2xl text-sm font-semibold shadow-2xl transition-all hover:-translate-y-0.5 ${
                selectAllPages
                  ? 'bg-orange-500/90 hover:bg-orange-400 text-slate-900'
                  : 'bg-purple-500/90 hover:bg-purple-400 text-slate-900'
              }`}
            >
              {selectAllPages ? 'All Selected' : 'Select All'} ({sortedStudents.length})
            </button>

            {selectedStudents.size > 0 && (
              <button
                onClick={() => {
                  setSelectedStudents(new Set())
                  setSelectAllPages(false)
                }}
                className="px-6 py-3 bg-slate-700/50 border border-slate-500/50 hover:bg-slate-600 text-slate-200 font-semibold rounded-2xl transition-all"
              >
                Clear ({selectedStudents.size})
              </button>
            )}

            <button
              onClick={exportToCSV}
              disabled={exporting || sortedStudents.length === 0}
              className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold rounded-2xl shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none flex items-center gap-2"
            >
              {exporting ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Exporting...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export CSV {selectedStudents.size > 0 && selectedStudents.size !== sortedStudents.length ? `(${selectedStudents.size})` : ''}
                </>
              )}
            </button>

            <button
              onClick={exportToPDF}
              disabled={exporting || sortedStudents.length === 0}
              className="px-6 py-3 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-semibold rounded-2xl shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none flex items-center gap-2"
            >
              {exporting ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Export PDF {selectedStudents.size > 0 && selectedStudents.size !== sortedStudents.length ? `(${selectedStudents.size})` : ''}
                </>
              )}
            </button>
          </div>

          {/* Results Table */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-black/20 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-4 text-left w-12">
                      <input
                        type="checkbox"
                        checked={paginatedStudents.length > 0 && paginatedStudents.every(s => selectedStudents.has(s.regno!))}
                        onChange={handleSelectCurrentPage}
                        className="w-4 h-4 rounded text-purple-500 focus:ring-purple-400"
                        title="Select all on this page"
                      />
                    </th>
                    {Array.from(selectedColumns).map(columnKey => {
                      const column = AVAILABLE_COLUMNS.find(col => col.key === columnKey)
                      if (!column) return null

                      if (['regno', 'name', 'department'].includes(columnKey)) {
                        return (
                          <th
                            key={columnKey}
                            className="px-4 py-4 font-semibold text-slate-200 cursor-pointer hover:bg-white/5 transition-colors text-left group"
                            onClick={() => handleSort(columnKey as keyof Student)}
                          >
                            <div className="flex items-center gap-2 group-hover:text-purple-300">
                              {column.label}
                              {sortField === columnKey && (
                                <span className="text-purple-400 font-bold">
                                  {sortDirection === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </div>
                          </th>
                        )
                      }

                      return (
                        <th key={columnKey} className="px-4 py-4 font-semibold text-slate-200 text-left">
                          {column.label}
                        </th>
                      )
                    })}
                    <th className="px-4 py-4 font-semibold text-slate-200 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {paginatedStudents.length === 0 ? (
                    <tr>
                      <td
                        colSpan={selectedColumns.size + 2}
                        className="px-4 py-12 text-center text-white/60"
                      >
                        No students found for <strong>{committee.name}</strong> matching your criteria
                      </td>
                    </tr>
                  ) : (
                    paginatedStudents.map((student, index) => (
                      <tr
                        key={`${student?.regno}-${index}`}
                        className={`hover:bg-white/5 transition-colors ${
                          selectedStudents.has(student.regno!) ? 'bg-sky-500/10' : ''
                        }`}
                      >
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={selectedStudents.has(student.regno!)}
                            onChange={() => handleSelectStudent(student.regno!)}
                            className="w-4 h-4 rounded text-purple-500 focus:ring-purple-400"
                          />
                        </td>
                        {Array.from(selectedColumns).map(columnKey => (
                          <td key={columnKey} className="px-4 py-4">
                            {columnKey === 'regno' ? (
                              <span className="font-mono text-slate-200 font-semibold">
                                {getCellValue(student, columnKey)}
                              </span>
                            ) : columnKey === 'name' ? (
                              <span className="font-medium text-slate-200">
                                {getCellValue(student, columnKey)}
                              </span>
                            ) : columnKey === 'category' ? (
                              <span className={`px-3 py-1 text-xs font-medium rounded-full border ${
                                student?.category === 'scholarship'
                                  ? 'bg-yellow-500/20 text-yellow-300 border-yellow-400/30'
                                  : 'bg-blue-500/20 text-blue-300 border-blue-400/30'
                              }`}>
                                {getCellValue(student, columnKey)}
                              </span>
                            ) : columnKey === 'status' ? (
                              <span className={`px-3 py-1 text-xs font-medium rounded-full border ${
                                student?.status === 'approved'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                                  : student?.status === 'pending'
                                  ? 'bg-yellow-500/20 text-yellow-300 border-yellow-400/30'
                                  : 'bg-red-500/20 text-red-300 border-red-400/30'
                              }`}>
                                {getCellValue(student, columnKey)}
                              </span>
                            ) : (
                              <span className="text-slate-300">
                                {getCellValue(student, columnKey)}
                              </span>
                            )}
                          </td>
                        ))}
                        <td className="px-4 py-4">
                          <button
                            onClick={() => handleViewDetails(student)}
                            className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white text-xs font-semibold rounded-lg transition-all shadow-lg"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bg-black/20 px-6 py-4 border-t border-white/10">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <p className="text-sm text-slate-300">
                    Showing{' '}
                    <span className="font-medium text-slate-100">
                      {(currentPage - 1) * itemsPerPage + 1}
                    </span>{' '}
                    to{' '}
                    <span className="font-medium text-slate-100">
                      {Math.min(currentPage * itemsPerPage, sortedStudents.length)}
                    </span>{' '}
                    of <span className="font-medium text-slate-100">{sortedStudents.length}</span> results
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      className="px-3 py-2 rounded-lg bg-black/30 border border-white/20 text-slate-200 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      «
                    </button>
                    <button
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-3 py-2 rounded-lg bg-black/30 border border-white/20 text-slate-200 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      ‹
                    </button>
                    {Array(Math.min(5, totalPages)).fill(0).map((_, i) => {
                      let pageNum: number
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (currentPage <= 3) {
                        pageNum = i + 1
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = currentPage - 2 + i
                      }

                      if (pageNum < 1 || pageNum > totalPages) return null

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-4 py-2 rounded-lg font-medium transition-all ${
                            currentPage === pageNum
                              ? 'bg-gradient-to-r from-purple-400 to-pink-500 text-slate-900 shadow-lg'
                              : 'bg-black/30 border border-white/20 text-slate-200 hover:bg-white/5'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                    <button
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="px-3 py-2 rounded-lg bg-black/30 border border-white/20 text-slate-200 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      ›
                    </button>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="px-3 py-2 rounded-lg bg-black/30 border border-white/20 text-slate-200 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      »
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Details Modal */}
        {showDetailsModal && selectedStudent && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="p-8 border-b border-white/10">
                <h2 className="text-3xl font-bold text-white mb-2">Student Details</h2>
                <p className="text-white/70">Complete information for {selectedStudent.name}</p>
              </div>
              <div className="p-8 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-white/60 uppercase tracking-wider">Registration Number</label>
                    <p className="text-white font-mono font-semibold text-lg">{selectedStudent.regno}</p>
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase tracking-wider">Name</label>
                    <p className="text-white font-semibold text-lg">{selectedStudent.name}</p>
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase tracking-wider">Email</label>
                    <p className="text-white">{selectedStudent.email || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase tracking-wider">Phone</label>
                    <p className="text-white">{selectedStudent.phone || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase tracking-wider">Department</label>
                    <p className="text-white">{selectedStudent.department || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase tracking-wider">Hostel</label>
                    <p className="text-white">{selectedStudent.hostel || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase tracking-wider">Room Number</label>
                    <p className="text-white">{selectedStudent.roomNumber || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase tracking-wider">Committee</label>
                    <p className="text-white">{getCommitteeName(selectedStudent.committee || '')}</p>
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase tracking-wider">Category</label>
                    <p className="text-white">
                      <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                        selectedStudent.category === 'scholarship'
                          ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/30'
                          : 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                      }`}>
                        {selectedStudent.category === 'scholarship' ? 'Scholarship' : 'Normal'}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-white/60 uppercase tracking-wider">Status</label>
                    <p className="text-white">
                      <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                        selectedStudent.status === 'approved'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                          : selectedStudent.status === 'pending'
                          ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/30'
                          : 'bg-red-500/20 text-red-300 border border-red-400/30'
                      }`}>
                        {formatStatus(selectedStudent.status)}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-white/10 flex gap-3 justify-end flex-wrap">
                <button
                  onClick={() => handleEditStudent(selectedStudent)}
                  className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold rounded-2xl shadow-2xl transition-all hover:-translate-y-0.5"
                >
                  Edit Details
                </button>
                <button
                  onClick={() => handleDeleteStudent(selectedStudent)}
                  className="px-6 py-3 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-semibold rounded-2xl shadow-2xl transition-all hover:-translate-y-0.5"
                >
                  Delete Student
                </button>
                <button
                  onClick={() => setShowDetailsModal(false)}
                  className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/20 text-white rounded-2xl font-medium transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && editForm && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="p-8 border-b border-white/10">
                <h2 className="text-3xl font-bold text-white mb-2">Edit Student Details</h2>
                <p className="text-white/70">Update information for {editForm.name}</p>
              </div>
              <div className="p-8 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Name</label>
                    <input
                      type="text"
                      value={editForm.name || ''}
                      onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Email</label>
                    <input
                      type="email"
                      value={editForm.email || ''}
                      onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Phone</label>
                    <input
                      type="text"
                      value={editForm.phone || ''}
                      onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Department</label>
                    <select
                      value={editForm.department || ''}
                      onChange={e => setEditForm({ ...editForm, department: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option className="bg-slate-800 text-white" value="">Select Department</option>
                      {uniqueDepartments.map(dept => (
                        <option className="bg-slate-800 text-white" key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Hostel</label>
                    <select
                      value={editForm.hostel || ''}
                      onChange={e => setEditForm({ ...editForm, hostel: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option className="bg-slate-800 text-white" value="">Select Hostel</option>
                      {uniqueHostels.map(hostel => (
                        <option className="bg-slate-800 text-white" key={hostel} value={hostel}>{hostel}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Room Number</label>
                    <input
                      type="text"
                      value={editForm.roomNumber || ''}
                      onChange={e => setEditForm({ ...editForm, roomNumber: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Committee</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={getCommitteeName(editForm.committee || '')}
                        disabled
                        className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white/50 cursor-not-allowed"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <svg className="w-5 h-5 text-white/30" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                    <p className="text-xs text-white/40 mt-1">Committee cannot be changed</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Category</label>
                    <select
                      value={editForm.category || 'normal'}
                      onChange={e => setEditForm({ ...editForm, category: e.target.value as 'scholarship' | 'normal' })}
                      className="w-full bg-white/5 border border-white/20 rounded-2xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option className="bg-slate-800 text-white" value="normal">Normal</option>
                      <option className="bg-slate-800 text-white" value="scholarship">Scholarship</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-white/10 flex gap-3 justify-end flex-wrap">
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold rounded-2xl shadow-2xl transition-all hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => {
                    setShowEditModal(false)
                    setEditForm(null)
                  }}
                  className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/20 text-white rounded-2xl font-medium transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && selectedStudent && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl max-w-md w-full shadow-2xl">
              <div className="p-8">
                <div className="flex justify-center mb-6">
                  <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-400/60 flex items-center justify-center">
                    <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-white text-center mb-3">Delete Student</h3>
                <p className="text-white/80 text-center mb-2">
                  Are you sure you want to delete <strong>{selectedStudent.name}</strong> ({selectedStudent.regno})?
                </p>
                <p className="text-red-300/80 text-sm text-center mb-8">
                  This action cannot be undone. All attendance records will also be deleted.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={confirmDeleteStudent}
                    disabled={deleting}
                    className="flex-1 py-3 px-6 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-semibold rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                  <button
                    onClick={() => {
                      setShowDeleteModal(false)
                      setSelectedStudent(null)
                    }}
                    className="flex-1 py-3 px-6 bg-white/5 hover:bg-white/10 border border-white/20 text-white rounded-xl font-medium transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes scale-in {
          from {
            transform: scale(0.9);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}
