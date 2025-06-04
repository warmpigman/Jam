"use client"

import type React from "react"
import { useState, useRef } from "react"
import { Input } from "@workspace/ui/components/input"
import { Badge } from "@workspace/ui/components/badge"
import { toast } from "sonner"
import { Search, Clock, X, CheckCircle, FileVideo, FileImage, FileText, File } from 'lucide-react'
import { cn } from "@workspace/ui/lib/utils";
import { FileObject } from "./types"
import { formatFileSize } from "./utils"

function getFileIcon(type: string) {
  switch (type) {
    case "video":
      return <FileVideo className="h-4 w-4 text-muted-foreground" />
    case "image":
      return <FileImage className="h-4 w-4 text-muted-foreground" />
    case "document":
      return <FileText className="h-4 w-4 text-muted-foreground" />
    case "archive":
      return <File className="h-4 w-4 text-muted-foreground" />
    default:
      return <File className="h-4 w-4 text-muted-foreground" />
  }
}

interface SearchBarProps {
  files: FileObject[]
  onFileSelect: (fileId: string) => void
}

export function SearchBar({ files, onFileSelect }: SearchBarProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Filter files based on search query
  const filteredFiles = files.filter(
    (file) =>
      file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.type.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const showSuggestions = isSearchFocused && (searchQuery.length > 0 || recentSearches.length > 0)

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
    setSelectedSuggestionIndex(-1)
  }

  const handleSuggestionClick = (file: FileObject) => {
    setSearchQuery(file.name)
    setIsSearchFocused(false)

    // Add to recent searches
    setRecentSearches((prev) => {
      const updated = [file.name, ...prev.filter((item) => item !== file.name)].slice(0, 5)
      return updated
    })

    onFileSelect(file.name)

    toast.success("File Found", {
      description: `Navigated to ${file.name}`,
      className: "toast-success",
      icon: <CheckCircle className="h-4 w-4" />,
      position: "top-right",
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) return

    const suggestions = searchQuery.length > 0 ? filteredFiles : []

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setSelectedSuggestionIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev))
        break
      case "ArrowUp":
        e.preventDefault()
        setSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : -1))
        break
      case "Enter":
        e.preventDefault()
        if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
          handleSuggestionClick(suggestions[selectedSuggestionIndex])
        }
        break
      case "Escape":
        setIsSearchFocused(false)
        setSelectedSuggestionIndex(-1)
        break
    }
  }

  const clearSearch = () => {
    setSearchQuery("")
    setSelectedSuggestionIndex(-1)
    searchInputRef.current?.focus()
  }

  return (
    <div className="relative w-full max-w-md">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          type="text"
          placeholder="Search files..."
          value={searchQuery}
          onChange={handleSearchChange}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
          onKeyDown={handleKeyDown}
          className={cn(
            "pl-10 pr-10 transition-all duration-200",
            isSearchFocused && "ring-2 ring-primary/20 border-primary/50",
          )}
          style={{
            backgroundColor: "oklch(0.274 0.006 286.033)",
            borderColor: isSearchFocused ? "oklch(0.92 0.004 286.32)" : "oklch(1 0 0 / 10%)",
            color: "oklch(0.985 0 0)",
          }}
        />
        {searchQuery && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Search Suggestions Dropdown */}
      {showSuggestions && (
        <div
          ref={suggestionsRef}
          className="absolute top-full left-0 right-0 mt-2 rounded-lg border shadow-lg z-50 max-h-80 overflow-hidden animate-in slide-in-from-top-2 duration-200"
          style={{
            backgroundColor: "oklch(0.21 0.006 285.885)",
            borderColor: "oklch(1 0 0 / 10%)",
          }}
        >
          <div className="max-h-80 overflow-y-auto">
            {/* Recent Searches */}
            {searchQuery.length === 0 && recentSearches.length > 0 && (
              <div className="p-2">
                <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Recent searches
                </div>
                {recentSearches.map((search, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setSearchQuery(search)
                      setIsSearchFocused(false)
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 rounded transition-colors"
                    style={{ color: "oklch(0.985 0 0)" }}
                  >
                    {search}
                  </button>
                ))}
              </div>
            )}

            {/* File Suggestions */}
            {searchQuery.length > 0 && (
              <div className="p-2">
                {filteredFiles.length > 0 ? (
                  <>
                    <div className="px-2 py-1 text-xs text-muted-foreground">
                      {filteredFiles.length} file{filteredFiles.length !== 1 ? "s" : ""} found
                    </div>
                    {filteredFiles.map((file, index) => (
                      <button
                        key={file.name}
                        onClick={() => handleSuggestionClick(file)}
                        className={cn(
                          "w-full text-left px-3 py-3 rounded transition-all duration-150 group",
                          selectedSuggestionIndex === index
                            ? "bg-primary/10 border-l-2 border-primary"
                            : "hover:bg-muted/30",
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0">{getFileIcon(file.type)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate" style={{ color: "oklch(0.985 0 0)" }}>
                                {file.name}
                              </span>
                              <Badge variant="secondary" className="text-xs bg-muted/50">
                                {file.type}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <span>{formatFileSize(file.size)}</span>
                              <span>•</span>
                              <span>{file.lastModified}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </>
                ) : (
                  <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                    No files found matching "{searchQuery}"
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
