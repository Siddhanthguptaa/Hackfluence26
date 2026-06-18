# Data Export Schema

This is the format of the Instagram data exports. You should expect it as defined in design requirements, and replicate it exactly when generating seed data.

## instagram-<username>-2025-06-13-YOudpLi7.zip

This ZIP archive contains the Instagram data export for the user `<username>` as of the particular date, and a random hash.

### connections/followers_and_following/followers_1.json
```json
[
  {
    "title": "",
    "media_list_data": [
      
    ],
    "string_list_data": [
      {
        "href": "https://www.instagram.com/username",
        "value": "username",
        "timestamp": 1749860021
      }
    ]
  }
]
```

### connections/followers_and_following/following.json
```json
{
  "relationships_following": [
    {
      "title": "",
      "media_list_data": [
        
      ],
      "string_list_data": [
        {
          "href": "https://www.instagram.com/username",
          "value": "username",
          "timestamp": 1749860021
        }
      ]
    }
  ]
}
```

### connections/followers_and_following/pending_follow_requests.json
```json
{
  "relationships_follow_requests_sent": [
    {
      "title": "",
      "media_list_data": [
        
      ],
      "string_list_data": [
        {
          "href": "https://www.instagram.com/username",
          "value": "username",
          "timestamp": 1749860021
        }
      ]
    }
  ]
}
```
