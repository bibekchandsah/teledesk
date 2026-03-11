
import re

def validate_tags(content):
    stack = []
    lines = content.split('\n')
    tag_pattern = re.compile(r'<(/?)([a-zA-Z0-9.]+)([^>]*?)(/?)>')
    
    for i, line in enumerate(lines):
        line_num = i + 1
        # Simple JSX parser - ignore some common non-tag usages
        line = re.sub(r'\{/\*.*?\*/\}', '', line) # Comments
        line = re.sub(r'//.*', '', line) # Line comments
        
        for match in tag_pattern.finditer(line):
            is_closing = match.group(1) == '/'
            tag_name = match.group(2)
            is_self_closing = match.group(4) == '/'
            
            # Simple skip for known self-closing or component-like tags that end in />
            if is_self_closing or tag_name in ['img', 'input', 'br', 'hr', 'video', 'TypingIndicator', 'UserAvatar', 'MoreVertical', 'MoreHorizontal', 'Paperclip', 'Mic', 'Send', 'Smile', 'Sticker', 'ImageIcon', 'X', 'ChevronLeft', 'ChevronUp', 'ChevronDown', 'Search', 'Pencil', 'MessageCircle', 'Pin', 'CornerUpLeft', 'Plus', 'Download', 'Copy', 'Trash2', 'Forward', 'ExternalLink', 'Phone', 'Play', 'Pause', 'Check', 'AlertCircle', 'Clock', 'FileText', 'File', 'Volume2', 'VolumeX', 'Maximize2', 'Minimize2', 'Star']:
                continue
                
            if is_closing:
                if not stack:
                    print(f"Extra closing tag </{tag_name}> at line {line_num}")
                    continue
                last_tag, last_line = stack.pop()
                if last_tag != tag_name:
                    print(f"Mismatched tag: opened <{last_tag}> at line {last_line}, closed with </{tag_name}> at line {line_num}")
            else:
                stack.append((tag_name, line_num))
                
    if stack:
        print("Unclosed tags:")
        for tag, line in stack:
            print(f"<{tag}> at line {line}")

with open(r'd:\programming exercise\social media\desktop-client\src\pages\ChatWindow.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
    validate_tags(content)
