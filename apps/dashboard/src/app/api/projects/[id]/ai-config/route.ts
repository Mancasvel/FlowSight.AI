import { NextRequest, NextResponse } from 'next/server';
import { getProjectsCollection } from '@/lib/mongodb';
import { AIConfig } from '@/lib/ai/types';

/**
 * GET /api/projects/:id/ai-config
 * Get AI configuration for a project
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const projects = await getProjectsCollection();
    const project = await projects.findOne({ projectId });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const aiConfig = project.settings?.aiConfig || null;

    return NextResponse.json({
      projectId,
      aiConfig,
      hasCustomConfig: !!aiConfig,
    });

  } catch (error: any) {
    console.error('Error fetching AI config:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/projects/:id/ai-config
 * Update AI configuration for a project (Enterprise feature)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const body = await request.json();

    // Validate AI config
    const aiConfig: AIConfig = {
      provider: body.provider || 'openrouter',
      apiKey: body.apiKey,
      model: body.model,
      baseURL: body.baseURL,
      maxTokens: body.maxTokens || 2000,
      temperature: body.temperature || 0.3,
      timeout: body.timeout || 30000,
    };

    // Validate required fields
    if (!aiConfig.apiKey || !aiConfig.model) {
      return NextResponse.json(
        { error: 'apiKey and model are required' },
        { status: 400 }
      );
    }

    // Validate provider-specific requirements
    if (aiConfig.provider === 'custom' && !aiConfig.baseURL) {
      return NextResponse.json(
        { error: 'baseURL is required for custom provider' },
        { status: 400 }
      );
    }

    // Update project
    const projects = await getProjectsCollection();
    const result = await projects.findOneAndUpdate(
      { projectId },
      {
        $set: {
          'settings.aiConfig': aiConfig,
          'settings.updatedAt': new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      projectId,
      aiConfig: result.settings.aiConfig,
    });

  } catch (error: any) {
    console.error('Error updating AI config:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/:id/ai-config
 * Remove custom AI configuration (revert to default)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const projects = await getProjectsCollection();
    
    await projects.updateOne(
      { projectId },
      {
        $unset: { 'settings.aiConfig': '' },
        $set: { 'settings.updatedAt': new Date() },
      }
    );

    return NextResponse.json({
      success: true,
      message: 'AI config removed, using default configuration',
    });

  } catch (error: any) {
    console.error('Error deleting AI config:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}


