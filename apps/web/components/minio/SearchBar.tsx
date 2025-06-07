"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { Input } from "@workspace/ui/components/input"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { toast } from "sonner"
import { Search, Clock, X, CheckCircle, FileVideo, FileImage, FileText, File, Sparkles, Loader2 } from 'lucide-react'
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
    case "text":
      return <FileText className="h-4 w-4 text-muted-foreground" />
    case "archive":
      return <File className="h-4 w-4 text-muted-foreground" />
    default:
      return <File className="h-4 w-4 text-muted-foreground" />
  }
}

// Helper function to infer file type from filename and content type
function inferFileType(filename: string, contentType?: string): string {
  const name = filename.toLowerCase()
  
  // Check content type first
  if (contentType) {
    if (contentType.startsWith('image/')) return 'image'
    if (contentType.startsWith('video/')) return 'video'
    if (contentType.startsWith('text/') || contentType === 'application/json') return 'document'
    if (contentType.includes('zip') || contentType.includes('archive')) return 'archive'
  }
  
  // Fallback to file extension
  if (name.match(/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/)) return 'image'
  if (name.match(/\.(mp4|avi|mov|wmv|flv|webm|mkv)$/)) return 'video'
  if (name.match(/\.(txt|md|json|xml|csv|log|js|ts|html|css|py|java|cpp|c|h)$/)) return 'document'
  if (name.match(/\.(zip|rar|7z|tar|gz|bz2)$/)) return 'archive'
  
  return 'document' // Default fallback
}

interface SearchResult extends FileObject {
  similarity?: number;
  preview?: string;
  vector_id?: string;
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
  const [isSemanticSearching, setIsSemanticSearching] = useState(false)
  const [semanticResults, setSemanticResults] = useState<SearchResult[]>([])
  const [searchMode, setSearchMode] = useState<'filename' | 'semantic'>('filename')
  const [showSemanticResults, setShowSemanticResults] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const semanticSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Filter files based on search query (filename search)
  const filteredFiles = files.filter(
    (file) =>
      file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.type.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const showSuggestions = isSearchFocused && (searchQuery.length > 0 || recentSearches.length > 0)

  // Debounced semantic search
  const performSemanticSearch = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 3) {
      setSemanticResults([])
      setShowSemanticResults(false)
      return
    }

    setIsSemanticSearching(true)
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query.trim(),
          limit: 10
        }),
      })

      if (!response.ok) {
        throw new Error('Search service unavailable')
      }

      const data = await response.json()
      
      // Enrich semantic results with actual file metadata from MinIO
      const enrichedResults = (data.results || []).map((result: any) => {
        // Find the corresponding file in the MinIO files list
        const minioFile = files.find(f => f.name === result.name || f.name === result.filename)
        
        if (minioFile) {
          // Use MinIO file data with semantic search enhancements
          return {
            ...minioFile,
            similarity: result.similarity || result.score || 0,
            similarity_score: result.similarity_score || result.score || 0,
            preview: result.preview,
            vector_id: result.vector_id,
            mongo_ref: result.mongo_ref,
          }
        } else {
          // Fallback: use semantic result data and infer file type
          const inferredType = inferFileType(result.filename || result.name, result.content_type)
          return {
            name: result.filename || result.name || 'Unknown',
            size: 0, // Unknown size
            lastModified: new Date().toISOString(), // Unknown date
            type: inferredType,
            similarity: result.similarity || result.score || 0,
            similarity_score: result.similarity_score || result.score || 0,
            preview: result.preview,
            vector_id: result.vector_id,
            mongo_ref: result.mongo_ref,
            content_type: result.content_type,
          }
        }
      })
      
      setSemanticResults(enrichedResults)
      setShowSemanticResults(true)
    } catch (error) {
      console.error('Semantic search error:', error)
      toast.error("Search Error", {
        description: "Semantic search is temporarily unavailable",
        icon: <X className="h-4 w-4" />,
        position: "top-right",
      })
      setSemanticResults([])
      setShowSemanticResults(false)
    } finally {
      setIsSemanticSearching(false)
    }
  }, [files])

  // Debounce semantic search
  useEffect(() => {
    if (searchMode === 'semantic' && searchQuery.length >= 3) {
      if (semanticSearchTimeoutRef.current) {
        clearTimeout(semanticSearchTimeoutRef.current)
      }
      
      semanticSearchTimeoutRef.current = setTimeout(() => {
        performSemanticSearch(searchQuery)
      }, 500) // 500ms debounce
    } else {
      setSemanticResults([])
      setShowSemanticResults(false)
    }

    return () => {
      if (semanticSearchTimeoutRef.current) {
        clearTimeout(semanticSearchTimeoutRef.current)
      }
    }
  }, [searchQuery, searchMode, performSemanticSearch])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
    setSelectedSuggestionIndex(-1)
  }

  const handleSuggestionClick = (file: FileObject | SearchResult) => {
    setSearchQuery(file.name)
    setIsSearchFocused(false)
    setShowSemanticResults(false)

    // Add to recent searches
    setRecentSearches((prev) => {
      const updated = [file.name, ...prev.filter((item) => item !== file.name)].slice(0, 5)
      return updated
    })

    onFileSelect(file.name)

    const similarity = 'similarity' in file && file.similarity 
      ? ` (${Math.round(file.similarity * 100)}% match)`
      : ''

    toast.success("File Found", {
      description: `Navigated to ${file.name}${similarity}`,
      className: "toast-success",
      icon: <CheckCircle className="h-4 w-4" />,
      position: "top-right",
    })
  }

  const toggleSearchMode = () => {
    const newMode = searchMode === 'filename' ? 'semantic' : 'filename'
    setSearchMode(newMode)
    setSemanticResults([])
    setShowSemanticResults(false)
    setSelectedSuggestionIndex(-1)
    
    toast.success("Search Mode Changed", {
      description: `Switched to ${newMode === 'semantic' ? 'AI semantic' : 'filename'} search`,
      icon: newMode === 'semantic' ? <Sparkles className="h-4 w-4" /> : <Search className="h-4 w-4" />,
      position: "top-right",
    })
  }

  const getCurrentSuggestions = () => {
    if (searchMode === 'semantic' && showSemanticResults) {
      return semanticResults
    }
    return searchQuery.length > 0 ? filteredFiles : []
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions && !showSemanticResults) return

    const suggestions = getCurrentSuggestions()

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
        setShowSemanticResults(false)
        setSelectedSuggestionIndex(-1)
        break
    }
  }

  const clearSearch = () => {
    setSearchQuery("")
    setSelectedSuggestionIndex(-1)
    setSemanticResults([])
    setShowSemanticResults(false)
    searchInputRef.current?.focus()
  }

  return (
    <div className="relative w-full max-w-md">
      {/* Search Input with Mode Toggle */}
      <div className="relative">
        <div className="flex">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              type="text"
              placeholder={searchMode === 'semantic' ? "Search by content meaning..." : "Search files..."}
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
              onKeyDown={handleKeyDown}
              className={cn(
                "pl-10 pr-10 transition-all duration-200 rounded-r-none border-r-0",
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
          
          {/* Search Mode Toggle Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggleSearchMode}
            className={cn(
              "rounded-l-none border-l-0 px-3 h-10 transition-all duration-200",
              searchMode === 'semantic' && "bg-primary/10 border-primary/50"
            )}
            style={{
              backgroundColor: searchMode === 'semantic' ? "oklch(0.4 0.1 260)" : "oklch(0.274 0.006 286.033)",
              borderColor: isSearchFocused ? "oklch(0.92 0.004 286.32)" : "oklch(1 0 0 / 10%)",
            }}
            title={`Switch to ${searchMode === 'semantic' ? 'filename' : 'semantic'} search`}
          >
            {isSemanticSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : searchMode === 'semantic' ? (
              <Sparkles className="h-4 w-4" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Search Mode Indicator */}
      {searchMode === 'semantic' && (
        <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
          <Sparkles className="h-3 w-3" />
          AI semantic search {searchQuery.length < 3 && "(type 3+ characters)"}
        </div>
      )}

      {/* Search Suggestions Dropdown */}
      {(showSuggestions || showSemanticResults) && (
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

            {/* Semantic Search Results */}
            {searchMode === 'semantic' && showSemanticResults && (
              <div className="p-2">
                {semanticResults.length > 0 ? (
                  <>
                    <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                      <Sparkles className="h-3 w-3" />
                      {semanticResults.length} semantic match{semanticResults.length !== 1 ? "es" : ""} found
                    </div>
                    {semanticResults.map((file, index) => (
                      <button
                        key={file.vector_id || file.name}
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
                              {file.similarity && (
                                <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                                  {Math.round(file.similarity * 100)}%
                                </Badge>
                              )}
                            </div>
                            {file.preview && (
                              <div className="mt-1 text-xs text-muted-foreground truncate">
                                {file.preview}
                              </div>
                            )}
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
                    <Sparkles className="h-4 w-4 mx-auto mb-2 opacity-50" />
                    No semantic matches found for "{searchQuery}"
                  </div>
                )}
              </div>
            )}

            {/* Filename Search Results */}
            {searchMode === 'filename' && searchQuery.length > 0 && (
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
