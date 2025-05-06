'use client'

import { useState, useEffect, ChangeEvent } from 'react'
import { Input } from '@workspace/ui/components/input'
import { Button } from '@workspace/ui/components/button'

interface MinioObject {
  name: string
  url: string
}

export default function Page() {
  const [objects, setObjects] = useState<MinioObject[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch the list of objects on mount
  const fetchObjects = async () => {
    setError(null)
    try {
      const res = await fetch('/api/minio/list')
      if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`)
      const data = await res.json()
      setObjects(data.files)
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Failed to load files')
    }
  }

  useEffect(() => {
    fetchObjects()
  }, [])

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null)
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0])
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file first.')
      return
    }
    setIsUploading(true)
    setError(null)

    try {
      const form = new FormData()
      form.append('file', selectedFile)

      const res = await fetch('/api/minio/upload', {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Upload failed: ${text}`)
      }

      setSelectedFile(null)
      await fetchObjects()
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Upload error')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-100 p-6 space-y-8">
      <div className="w-full max-w-2xl bg-white p-6 rounded-lg shadow">
        <h1 className="text-2xl font-semibold mb-4">File Manager</h1>

        <div className="space-y-2">
          <label className="block text-sm font-medium">Upload a file</label>
          <div className="flex gap-2">
            <Input
              type="file"
              onChange={handleFileChange}
              accept="*/*"
            />
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || isUploading}
            >
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
          {selectedFile && (
            <p className="text-sm text-gray-600">Selected: {selectedFile.name}</p>
          )}
        </div>

        {error && (
          <p className="mt-4 text-red-600">{error}</p>
        )}
      </div>

      <div className="w-full max-w-4xl">
        <h2 className="text-xl font-semibold mb-4">Stored Files</h2>
        {objects.length === 0 && (
          <p className="text-gray-500">No files found. Upload something above!</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {objects.map((obj) => (
            <div
              key={obj.name}
              className="bg-white rounded-lg overflow-hidden shadow hover:shadow-lg transition"
            >
              <img
                src={obj.url}
                alt={obj.name}
                className="w-full h-40 object-cover"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).src =
                    'https://via.placeholder.com/320x240?text=Preview+Unavailable'
                }}
              />
              <div className="p-2">
                <p className="text-sm truncate" title={obj.name}>
                  {obj.name}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
