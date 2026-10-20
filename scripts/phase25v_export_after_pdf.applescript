with timeout of 600 seconds
    tell application "Microsoft Word"
        open (POSIX file "/Users/mac/Downloads/after.docx")
        repeat 30 times
            if (count of documents) > 0 then exit repeat
            delay 1
        end repeat
        delay 5
        set docName to its name of front document
        log "Opened: " & docName
        set savePath to "/Users/mac/Downloads/after.pdf"
        save as document docName file name savePath file format format PDF
        log "Saved PDF!"
        try
            close document docName saving no
        end try
    end tell
end timeout
