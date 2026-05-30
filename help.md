LINK FORMAT: https://suno.com/@{ACCOUNT}?page=songs

COOL ACCOUNTS LIST:
 – kinkypanda



 https://suno.com/@kinkypanda?page=songs
 NEXT find "user_id" in response and parse it
 (...""user_id\":\"78af3939-1b36-4868-b67e-cbfcc4130fb8\"...)

 POST: https://studio-api-prod.suno.com/api/unified/feed
 BODY: 
 {"feed_id":"user_songs","target_user_id":"78af3939-1b36-4868-b67e-cbfcc4130fb8","request_metadata":{"sort_by":"upvote_count"},"cursor":"20","page_size":20}


 CREATE m3u LIKE THIS
 #EXTM3U
#EXTINF:214 tvg-logo="https://example.com" group-title="Rock",Linkin Park - In The End
https://server.com.mp3

#EXTINF:241 tvg-logo="https://example.com" group-title="Rap",Eminem - Lose Yourself
https://server.com.mp3