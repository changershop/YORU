package com.example.yoru.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.yoru.data.model.CommunityComment
import com.example.yoru.data.model.CommunityPost
import com.example.yoru.ui.theme.*

@Composable
fun CommunityScreen(
    posts: List<CommunityPost>,
    commentsMap: Map<String, List<CommunityComment>>,
    onAddPost: (String) -> Unit,
    onLikePost: (String) -> Unit,
    onAddComment: (String, String) -> Unit
) {
    var newPostContent by remember { mutableStateOf("") }
    var expandedPostId by remember { mutableStateOf<String?>(null) }
    var commentInput by remember { mutableStateOf("") }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(YoruBackground)
            .statusBarsPadding()
            .testTag("community_screen"),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 90.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Title Header
        item {
            Column {
                Text(
                    text = "YORU Community",
                    style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.ExtraBold),
                    color = YoruTextPrimary
                )
                Text(
                    text = "Discuss episodes, theories, soundtracks & recommendations",
                    style = MaterialTheme.typography.bodySmall,
                    color = YoruTextMuted
                )
            }
        }

        // Post Creator Card
        item {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("community_new_post_card"),
                colors = CardDefaults.cardColors(containerColor = YoruSurfaceElevated),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        text = "Share with the community",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = YoruTextPrimary
                    )

                    OutlinedTextField(
                        value = newPostContent,
                        onValueChange = { newPostContent = it },
                        placeholder = { Text("What are you watching today? Share your thoughts...", color = YoruTextMuted, fontSize = 13.sp) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(90.dp)
                            .testTag("community_post_input"),
                        shape = RoundedCornerShape(10.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = YoruBackground,
                            unfocusedContainerColor = YoruBackground,
                            focusedBorderColor = YoruIndigoPrimary,
                            unfocusedBorderColor = YoruCardBorder,
                            focusedTextColor = YoruTextPrimary,
                            unfocusedTextColor = YoruTextPrimary
                        )
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End
                    ) {
                        Button(
                            onClick = {
                                if (newPostContent.isNotBlank()) {
                                    onAddPost(newPostContent.trim())
                                    newPostContent = ""
                                }
                            },
                            enabled = newPostContent.isNotBlank(),
                            colors = ButtonDefaults.buttonColors(containerColor = YoruIndigoPrimary),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.testTag("community_publish_btn")
                        ) {
                            Icon(imageVector = Icons.Default.Send, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Publish Post", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                    }
                }
            }
        }

        // Community Posts Feed
        items(posts) { post ->
            val isExpanded = expandedPostId == post.id
            val postComments = commentsMap[post.id] ?: emptyList()

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("community_post_${post.id}"),
                colors = CardDefaults.cardColors(containerColor = YoruSurfaceElevated),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    // Author Header
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(36.dp)
                                    .clip(RoundedCornerShape(18.dp))
                                    .background(YoruIndigoPrimary),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = post.authorName.take(1).uppercase(),
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 15.sp
                                )
                            }

                            Column {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Text(
                                        text = post.authorName,
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = YoruTextPrimary
                                    )
                                    if (post.authorRole == "moderator") {
                                        Box(
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(4.dp))
                                                .background(YoruIndigoPrimary.copy(alpha = 0.2f))
                                                .padding(horizontal = 4.dp, vertical = 2.dp)
                                        ) {
                                            Text(
                                                text = "MOD",
                                                color = YoruIndigoPrimary,
                                                fontSize = 9.sp,
                                                fontWeight = FontWeight.ExtraBold
                                            )
                                        }
                                    }
                                }
                                Text(
                                    text = post.timestamp,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = YoruTextMuted,
                                    fontSize = 11.sp
                                )
                            }
                        }

                        if (post.isPinned) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(2.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.PushPin,
                                    contentDescription = "Pinned",
                                    tint = YoruIndigoPrimary,
                                    modifier = Modifier.size(14.dp)
                                )
                                Text(
                                    text = "Pinned",
                                    color = YoruIndigoPrimary,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    // Post content
                    Text(
                        text = post.content,
                        style = MaterialTheme.typography.bodyLarge,
                        color = YoruTextPrimary
                    )

                    // Hashtags
                    if (post.hashtags.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            post.hashtags.forEach { tag ->
                                Text(
                                    text = "#$tag",
                                    color = YoruIndigoPrimary,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    // Reactions & Comments Row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Like Button
                        TextButton(
                            onClick = { onLikePost(post.id) },
                            colors = ButtonDefaults.textButtonColors(contentColor = YoruTextPrimary),
                            modifier = Modifier.testTag("like_post_${post.id}")
                        ) {
                            Icon(
                                imageVector = Icons.Default.Favorite,
                                contentDescription = "Like",
                                tint = YoruErrorRed,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(text = "${post.likesCount}", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }

                        // Comments Toggle Button
                        TextButton(
                            onClick = {
                                expandedPostId = if (isExpanded) null else post.id
                            },
                            colors = ButtonDefaults.textButtonColors(contentColor = YoruTextPrimary),
                            modifier = Modifier.testTag("toggle_comments_${post.id}")
                        ) {
                            Icon(
                                imageVector = Icons.Default.ChatBubbleOutline,
                                contentDescription = "Comments",
                                tint = YoruIndigoPrimary,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(text = "${post.commentCount + postComments.size} Comments", fontSize = 13.sp)
                        }
                    }

                    // Expanded Comments
                    if (isExpanded) {
                        Spacer(modifier = Modifier.height(10.dp))
                        HorizontalDivider(color = YoruCardBorder)
                        Spacer(modifier = Modifier.height(10.dp))

                        // Comment input
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            OutlinedTextField(
                                value = commentInput,
                                onValueChange = { commentInput = it },
                                placeholder = { Text("Write a reply...", color = YoruTextMuted, fontSize = 12.sp) },
                                modifier = Modifier
                                    .weight(1f)
                                    .testTag("comment_input_${post.id}"),
                                shape = RoundedCornerShape(8.dp),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedContainerColor = YoruBackground,
                                    unfocusedContainerColor = YoruBackground,
                                    focusedBorderColor = YoruIndigoPrimary,
                                    unfocusedBorderColor = YoruCardBorder,
                                    focusedTextColor = YoruTextPrimary,
                                    unfocusedTextColor = YoruTextPrimary
                                ),
                                singleLine = true
                            )

                            Button(
                                onClick = {
                                    if (commentInput.isNotBlank()) {
                                        onAddComment(post.id, commentInput.trim())
                                        commentInput = ""
                                    }
                                },
                                enabled = commentInput.isNotBlank(),
                                shape = RoundedCornerShape(8.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = YoruIndigoPrimary),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                                modifier = Modifier.testTag("submit_comment_${post.id}")
                            ) {
                                Text("Reply", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }

                        // Comments list
                        Spacer(modifier = Modifier.height(8.dp))
                        postComments.forEach { comment ->
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp)
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(YoruBackground)
                                    .padding(8.dp)
                            ) {
                                Column {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text(
                                            text = comment.authorName,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 12.sp,
                                            color = YoruIndigoPrimary
                                        )
                                        Text(
                                            text = comment.timestamp,
                                            fontSize = 10.sp,
                                            color = YoruTextMuted
                                        )
                                    }
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text(
                                        text = comment.content,
                                        fontSize = 12.sp,
                                        color = YoruTextPrimary
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
