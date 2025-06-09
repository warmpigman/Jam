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
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv'].includes(extension)) return 'video';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(extension)) return 'image';
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'md'].includes(extension)) return 'document';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) return 'archive';
  
  return 'file';
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
  const [searchMode, setSearchMode] = useState<'filename' | 'semantic' | 'hybrid'>('filename')
  const [showSemanticResults, setShowSemanticResults] = useState(false)
  const [isFading, setIsFading] = useState(false)
  const [showHybridToggle, setShowHybridToggle] = useState(false)
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
      // Determine which endpoint to use based on search mode
      const endpoint = searchMode === 'hybrid' ? '/api/hybrid_search' : '/api/search'
      
      const response = await fetch(endpoint, {
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
      const enrichedResults = data.results?.map((result: any) => {
        const filename = result.filename || result.name || 'Unknown'
        const matchingFile = files.find(f => f.name === filename)
        
        if (matchingFile) {
          return {
            ...matchingFile,
            similarity: result.similarity || result.score || 0,
            similarity_score: result.similarity_score || result.score || 0,
            preview: result.preview,
            vector_id: result.vector_id,
            mongo_ref: result.mongo_ref,
            content_type: result.content_type,
          }
        } else {
          const inferredType = inferFileType(filename, result.content_type)
          return {
            name: filename,
            size: result.size || 0,
            url: result.url || '#',
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
  }, [files, searchMode])

  // Effect to detect if in semantic mode (for showing hybrid toggle)
  useEffect(() => {
    if (searchMode === 'semantic') {
      // Show hybrid toggle with animation
      setShowHybridToggle(true)
    } else if (searchMode === 'filename') {
      // Hide hybrid toggle when returning to normal mode
      setShowHybridToggle(false)
    }
  }, [searchMode])

  // Debounce semantic/hybrid search
  useEffect(() => {
    if ((searchMode === 'semantic' || searchMode === 'hybrid') && searchQuery.length >= 3) {
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
      ? ` (${file.similarity.toFixed(2)})`
      : ''

    toast.success("File Found", {
      description: `Navigated to ${file.name}${similarity}`,
      className: "toast-success",
      icon: <CheckCircle className="h-4 w-4" />,
      position: "top-right",
    })
  }

  const toggleSearchMode = () => {
    setIsFading(true)
    
    // Start fade out
    setTimeout(() => {
      // Cycle through modes: filename -> semantic -> hybrid -> filename
      let newMode: 'filename' | 'semantic' | 'hybrid';
      
      if (searchMode === 'filename') {
        newMode = 'semantic';
      } else if (searchMode === 'semantic') {
        newMode = 'filename'; // Back to filename by default
      } else {
        newMode = 'filename';
      }
      
      setSearchMode(newMode)
      setSemanticResults([])
      setShowSemanticResults(false)
      setSelectedSuggestionIndex(-1)
      // Don't clear search query - preserve it when switching modes
      
      toast.success(`${newMode === 'semantic' ? 'Semantic' : newMode === 'hybrid' ? 'Hybrid' : 'Regular'} Search Enabled`, {
        description: newMode === 'semantic'
          ? "AI-powered semantic search is now active"
          : newMode === 'hybrid'
            ? "Combined keyword and semantic search activated"
            : "Switched back to regular keyword search",
        icon: newMode === 'semantic' || newMode === 'hybrid' ? <Sparkles className="h-4 w-4" /> : <Search className="h-4 w-4" />,
        position: "top-right",
      })

      // End fade out, start fade in
      setTimeout(() => {
        setIsFading(false)
        searchInputRef.current?.focus()
      }, 50)
    }, 150)
  }
  
  // Toggle to hybrid search mode
  const toggleHybridMode = () => {
    setIsFading(true)
    
    // Start fade out
    setTimeout(() => {
      const newMode = searchMode === 'hybrid' ? 'semantic' : 'hybrid'
      setSearchMode(newMode)
      
      toast.success(`${newMode === 'hybrid' ? 'Hybrid' : 'Semantic'} Search Enabled`, {
        description: newMode === 'hybrid'
          ? "Combined keyword and semantic search activated"
          : "Switched back to AI-powered semantic search",
        icon: <Sparkles className="h-4 w-4" />,
        position: "top-right",
      })

      // End fade out, start fade in
      setTimeout(() => {
        setIsFading(false)
      }, 50)
    }, 150)
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
        <div
          className={cn(
            "absolute left-3 top-1/2 transform -translate-y-1/2 flex items-center gap-1 transition-all duration-300 ease-in-out",
            isFading && "opacity-50",
          )}
        >
          {searchMode === 'semantic' ? (
            <div className="flex items-center gap-1">
              <Sparkles className="h-4 w-4 text-primary animate-pulse" />
              {isSemanticSearching && (
                <div className="flex gap-0.5">
                  <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              )}
            </div>
          ) : (
            <Search className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        <Input
          ref={searchInputRef}
          type="text"
          placeholder={
            searchMode === 'semantic' 
              ? "Ask AI to find files..." 
              : searchMode === 'hybrid'
                ? "Search with AI + keywords..."
                : "Search files..."
          }
          value={searchQuery}
          onChange={handleSearchChange}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
          onKeyDown={handleKeyDown}
          className={cn(
            "pl-12 pr-28 transition-all duration-300 ease-in-out",
            isSearchFocused && "ring-2 ring-primary/20 border-primary/50",
            (searchMode === 'semantic' || searchMode === 'hybrid') && "bg-gradient-to-r from-primary/5 to-transparent border-primary/30",
            isFading && "opacity-50 scale-[0.98]",
          )}
          style={{
            backgroundColor: (searchMode === 'semantic' || searchMode === 'hybrid') ? "oklch(0.274 0.006 286.033)" : "oklch(0.274 0.006 286.033)",
            borderColor: isSearchFocused
              ? "oklch(0.92 0.004 286.32)"
              : (searchMode === 'semantic' || searchMode === 'hybrid')
                ? "oklch(0.92 0.004 286.32 / 30%)"
                : "oklch(1 0 0 / 10%)",
            color: "oklch(0.985 0 0)",
            transition: "all 0.3s ease-in-out",
          }}
        />

        {/* AI Toggle Button - More Prominent */}
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
          {searchQuery && (
            <button onClick={clearSearch} className="text-muted-foreground hover:text-foreground transition-colors p-1">
              <X className="h-3 w-3" />
            </button>
          )}

          {/* More Button-like AI Toggle */}
          <Button
            variant={searchMode === 'semantic' ? "default" : "outline"}
            size="sm"
            onClick={toggleSearchMode}
            className={cn(
              "h-7 px-3 text-xs font-medium transition-all duration-300 ease-in-out relative overflow-hidden border",
              searchMode === 'semantic'
                ? "bg-primary text-primary-foreground hover:bg-primary/90 border-primary shadow-sm"
                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground border-border hover:border-primary/50",
              isFading && "opacity-75 scale-95",
            )}
          >
            {searchMode === 'semantic' && (
              <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent animate-pulse" />
            )}
            <div className="relative flex items-center gap-1.5">
              {searchMode === 'semantic' ? (
                <>
                  <Sparkles className="h-3 w-3" />
                  <span>AI Search</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3" />
                  <span>Try AI</span>
                </>
              )}
            </div>
          </Button>
        </div>
      </div>

      {/* Search Mode Indicator */}
      {searchMode === 'semantic' && (
        <div
          className={cn(
            "absolute -bottom-6 left-0 flex items-center gap-1 text-xs text-primary/70 transition-all duration-300 ease-in-out",
            isFading ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0",
          )}
        >
          <Sparkles className="h-3 w-3 animate-pulse" />
          <span>{searchMode === 'hybrid' ? "Hybrid search active" : "Semantic search active"}</span>
        </div>
      )}
      
      {/* Hybrid Search Toggle - Appears when AI mode is enabled */}
      {showHybridToggle && (
        <div
          className={cn(
            "absolute -top-10 right-3 transition-all duration-300 ease-in-out",
            searchMode === 'hybrid' ? "opacity-100 translate-y-0" : "opacity-100 translate-y-0",
            isFading && "opacity-50 scale-95",
          )}
          style={{ 
            animationName: 'slideDown',
            animationDuration: '0.5s',
            animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
            animationFillMode: 'both',
          }}
        >
          <Button
            variant={searchMode === 'hybrid' ? "default" : "outline"}
            size="sm"
            onClick={toggleHybridMode}
            className={cn(
              "h-7 px-3 text-xs font-medium transition-all duration-300 ease-in-out border",
              searchMode === 'hybrid'
                ? "bg-primary/80 text-primary-foreground border-primary/50 shadow-md"
                : "bg-background/80 backdrop-blur-sm text-muted-foreground hover:text-foreground border-primary/30 hover:border-primary/50",
            )}
          >
            <div className="flex items-center gap-1.5">
              <Search className="h-3 w-3" />
              <span>+</span>
              <Sparkles className="h-3 w-3" />
              <span>{searchMode === 'hybrid' ? "Hybrid ON" : "Try Hybrid"}</span>
            </div>
          </Button>
        </div>
      )}

      {/* Search Suggestions Dropdown */}
      {(showSuggestions || showSemanticResults) && (
        <div
          ref={suggestionsRef}
          className={cn(
            "absolute top-full left-0 right-0 mt-2 rounded-lg border shadow-lg z-50 animate-in slide-in-from-top-2 duration-200",
            searchMode === 'semantic' && "border-primary/20 shadow-primary/10",
          )}
          style={{
            backgroundColor: "oklch(0.21 0.006 285.885)",
            borderColor: searchMode === 'semantic' ? "oklch(0.92 0.004 286.32 / 20%)" : "oklch(1 0 0 / 10%)",
            maxHeight: "320px", // Set explicit max height
            overflow: "hidden", // Hide overflow on container
          }}
        >
          {/* AI Search Header */}
          {(searchMode === 'semantic' || searchMode === 'hybrid') && searchQuery.length > 0 && (
            <div className="p-3 border-b border-primary/10 bg-gradient-to-r from-primary/5 to-transparent flex-shrink-0">
              <div className="flex items-center gap-2 text-xs">
                {searchMode === 'hybrid' ? (
                  <>
                    <div className="flex items-center gap-1">
                      <Search className="h-3 w-3 text-primary" />
                      <span>+</span>
                      <Sparkles className="h-3 w-3 text-primary animate-pulse" />
                    </div>
                    <span className="text-primary font-medium">Hybrid Search Results</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3 text-primary animate-pulse" />
                    <span className="text-primary font-medium">AI-Powered Results</span>
                  </>
                )}
                
                {isSemanticSearching && (
                  <div className="flex gap-0.5 ml-2">
                    <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="overflow-y-auto" style={{ maxHeight: searchMode === 'semantic' && searchQuery.length > 0 ? "260px" : "320px" }}>
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
                          "w-full text-left px-3 py-3 rounded transition-all duration-150 group relative",
                          selectedSuggestionIndex === index
                            ? "bg-primary/15 border-l-2 border-primary shadow-sm"
                            : "hover:bg-muted/30",
                        )}
                      >
                        {selectedSuggestionIndex === index && (
                          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent rounded" />
                        )}
                        <div className="flex items-center gap-3 relative">
                          <div className="flex-shrink-0 flex items-center gap-1">
                            {getFileIcon(file.type)}
                            <Sparkles className="h-2 w-2 text-primary/60" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate" style={{ color: "oklch(0.985 0 0)" }}>
                                {file.name}
                              </span>
                              <Badge
                                variant="secondary"
                                className="text-xs bg-primary/20 text-primary"
                              >
                                {file.type}
                              </Badge>
                              {file.similarity && (
                                <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                                  {file.similarity.toFixed(2)}
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
                              <span>•</span>
                              <span className="text-primary/70 flex items-center gap-1">
                                <Sparkles className="h-2 w-2" />
                                AI Match
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </>
                ) : (
                  <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary/50" />
                      <span>AI couldn't find files matching "{searchQuery}"</span>
                      <span className="text-xs text-muted-foreground/70">
                        Try describing what you're looking for differently
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Hybrid Search Results */}
            {searchMode === 'hybrid' && showSemanticResults && (
              <div className="p-2">
                {semanticResults.length > 0 ? (
                  <>
                    <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Search className="h-3 w-3" />
                        <span>+</span>
                        <Sparkles className="h-3 w-3" />
                      </div>
                      {semanticResults.length} hybrid match{semanticResults.length !== 1 ? "es" : ""} found
                    </div>
                    {semanticResults.map((file, index) => (
                      <button
                        key={file.vector_id || file.name}
                        onClick={() => handleSuggestionClick(file)}
                        className={cn(
                          "w-full text-left px-3 py-3 rounded transition-all duration-150 group relative",
                          selectedSuggestionIndex === index
                            ? "bg-primary/15 border-l-2 border-primary shadow-sm"
                            : "hover:bg-muted/30",
                        )}
                      >
                        {selectedSuggestionIndex === index && (
                          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent rounded" />
                        )}
                        <div className="flex items-center gap-3 relative">
                          <div className="flex-shrink-0 flex items-center gap-1">
                            {getFileIcon(file.type)}
                            <div className="flex items-center gap-0.5">
                              <Search className="h-2 w-2 text-primary/60" />
                              <Sparkles className="h-2 w-2 text-primary/60" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate" style={{ color: "oklch(0.985 0 0)" }}>
                                {file.name}
                              </span>
                              <Badge
                                variant="secondary"
                                className="text-xs bg-primary/20 text-primary"
                              >
                                {file.type}
                              </Badge>
                              {file.similarity && (
                                <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                                  {file.similarity.toFixed(2)}
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
                              <span>•</span>
                              <span className="text-primary/70 flex items-center gap-1">
                                <div className="flex items-center gap-0.5">
                                  <Search className="h-2 w-2" />
                                  <span>+</span>
                                  <Sparkles className="h-2 w-2" />
                                </div>
                                Hybrid Match
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </>
                ) : (
                  <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Search className="h-5 w-5 text-primary/50" />
                        <span>+</span>
                        <Sparkles className="h-5 w-5 text-primary/50" />
                      </div>
                      <span>No hybrid matches found for "{searchQuery}"</span>
                      <span className="text-xs text-muted-foreground/70">
                        Try a different search term or switch to another search mode
                      </span>
                    </div>
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
